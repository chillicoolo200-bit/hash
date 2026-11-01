# Design notes

## Problem
Volunteer organisers (para puja committees, college fest teams, families) plan with scattered chats and memory.
They need a budget that adds up, a deadline for each job, the right questions to ask vendors, and a fast way to see
what breaks when something slips.

## Decisions

| Decision | Why | Trade-off |
|---|---|---|
| Plan computed in the browser by `core.js` | Instant, works offline, exact; the same file is tested in Node | The server and browser must agree, so both load the same file |
| AI only for ideas, tips and wording | Models are weak at arithmetic and dates; wording is where they help | Less "magic", more trust |
| Strict JSON answer + validation + sanitising | Never render raw model output | A malformed answer falls back to templates |
| Template fallback with a visible reason | The app is useful with no key, no quota or no network, and the user can see why | Templates are less personal |
| Model list tried in order, overridable by env | Model names change often | Slightly more code |
| No dependencies, no build | Small repo, nothing to patch, deploys anywhere | Hand-written DOM code |
| Strict CSP, `textContent` only | Removes the main XSS routes | Styles/scripts must be separate files |
| Server code only under `api/` | Not served as a static file; one function, one place to harden | Browser and server share `core.js`, which is public by design |
| Content (`data.js`) and text (`strings.js`) apart from logic | Easier to review, translate and test | More files |
| Rule-based answers beside the AI | Questions and ideas still work with no key or quota | Rules are simpler than a model |
| Numbers parsed by `toWholeNumber`, not `Number()` | `Number()` accepts `0x64`, `1e4`, `[100]`; a form should only accept what a person would type (Bengali digits included) | A few unusual spellings are refused with a clear message |
| One safety net around the whole API handler | A bug becomes a short JSON 500 and a log line, never a stack trace or a hung request | The client just shows the built-in answer |
| No `temperature`/`topP`/`topK` in the Gemini request | Google deprecated them from Gemini 3.5 (ignored now, an error in later generations) | Wording variety comes from the prompt, not a dial |
| Answer cache + shared in-flight call on the server | The same plan, language and question should cost one Gemini call, not several (language toggles, repeated chips, reloads, double taps) | Per warm instance only; an answer can be up to 10 minutes old |
| Only Gemini answers are cached, never fallbacks | A fallback caused by an outage must not stick after the outage ends | A failing model is retried on every request |
| Session cache and "pause when no key / quota" in the browser | Removes round trips whose result is already known; the built-in answer is identical to what the server would send | The page keeps showing the paused reason until reload (no key, refused) or one minute (quota) |
| Superseded requests are aborted | A replaced request no longer holds a connection or triggers fallback work | The server may still finish the call it already started |
| Rate limiter is its own small function | Testable with a fake clock, and it can send `Retry-After` | Still per warm instance |

## Data flow
1. The browser validates the form with `core.validateInput` and builds the plan with `core.buildPlan`.
2. It sends the validated request (plus its own calendar day, and for a question `action: 'ask'` and the question) to `POST /api/assist`.
3. The server validates again, rebuilds the plan, builds a prompt (instructions separate from quoted user data), asks Gemini
   for JSON, parses and cleans it, and returns it. On any failure it returns the template answer instead.
4. Re-planning (`core.applyChange`), the calendar file and the text copy never call the server; "refresh AI advice" is an explicit button.

## Scheduling rules
* Each template task has a lead time (days before the event) and dependencies. A task is never due before a task it depends on.
* If there is less time than the template needs, all lead times are scaled down proportionally (order is preserved).
* A delay moves a task later; dependents move only if they run out of slack. A task landing after the event date is flagged.

## Context rules
Rainy months (June to September), busy booking months, volunteer ratio and the vegetarian-only question are small, explicit rules in
`core.js`. They produce warnings and tags only; they never change the money or the order of dependent tasks.

## Testing strategy
Pure logic is tested exhaustively (every preset, every template invariant, many budgets, calendar-file validity). The API is tested
with a fake `fetch`, covering each failure mode and hostile input. Static tests check the interface files (labels, ids, heading
order, CSP-safe markup, translation completeness, colour contrast, no secrets). The interface was also exercised in a real browser at
phone widths with the production Content-Security-Policy turned on.

## Known limits
* The rate limiter is per warm instance, not global. Under a flood from more than 500 addresses at once it refuses new addresses rather than grow without bound.
* Third-party GitHub Actions are pinned by version tag (`@v4`), not by commit hash; Dependabot proposes updates monthly.
* The answer cache is per warm instance, like the rate limiter; it is a saving, not a guarantee. A cache hit still counts against the per-IP rate limit.
* "Refresh AI advice" after a task delay returns the cached advice, because the server is not told about delays (it sees the same event details). Sending delays to the server would make the refresh meaningful; it is not done yet.
* Static scripts are served with revalidation (ETag), not long-lived caching, because file names carry no content hash and the project has no build step; a long cache could mix versions of `core.js` and `app.js` after a deploy.
* Budget presets and thresholds are heuristics.
* Gemini output quality varies; the notes field is treated as untrusted but no model is injection-proof, which is why the
  output is sanitised and cannot execute anything.