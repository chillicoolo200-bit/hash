# অনুষ্ঠান বন্ধু (Anushthan Bondhu)

A GenAI-assisted event planner for **neighbourhood pujas, college fests, birthdays and family functions** in
West Bengal. Built for PromptWars Virtual, Challenge 5 (*Celebration & Event Planner*). Works in Bengali and English
and is designed for a phone screen.

**Chosen vertical / persona:** a volunteer organiser of a para puja or college fest: small budget, short time,
many people to coordinate. Birthdays and family events (weddings, annaprashan) use the same engine.

## What it does

1. **Asks a few practical questions:** event type, date, number of guests, total budget, vegetarian-only, free-text notes.
2. **Splits the budget** by category (always adds up to the exact total, with a 10% contingency fund) and warns when the
   budget per guest or food per guest looks too low, naming what to trim first.
3. **Builds a timeline backwards from the event date**, with dependencies ("no permission, no sound booking") and
   "ask the vendor these questions before you book" checklists.
4. **Decides from context:** rainy months add a rain-cover warning; in busy booking months vendor tasks are tagged
   "book early"; crowd events get a volunteer estimate (one per 25 guests, at least 4); vegetarian-only adds a kitchen
   question to every food task; a tight schedule is compressed and flagged.
5. **Re-plans when something changes:** a task is late, the date moves, the budget or guest count changes. It shows exactly
   which tasks moved, which budget lines changed and which new warnings appear. Small delays are absorbed by slack.
6. **Uses Gemini for the creative part:** a "do this first" step, 5 personalised ideas, 3 ways to spend less, and a
   ready-to-send WhatsApp message (contribution request for a puja, sponsorship request for a fest, invitation otherwise).
7. **Answers questions about the plan** ("What should I book first?", "What if it rains?"). Gemini answers from the real plan;
   if it cannot, fixed rules answer from the same plan data.
8. **Takes the plan with you:** download the timeline as a calendar file (.ics, one all-day event per task with a reminder),
   copy it as text for a WhatsApp group, or print/save as PDF.

## How it works

```
Browser (index.html, app.js, strings.js, core.js, data.js)
   |  plan = core.js: instant, offline, exact
   |
   +--POST /api/assist-->  api/assist.js  -> validate -> prompt -> Gemini -> parse -> clean
                           (any failure: built-in templates / rules, with the reason shown)
```

* **Code decides the numbers.** Money, dates, dependencies, context rules and re-planning are pure functions in `core.js`
  (content in `data.js`). No network, no randomness, so they are exact and testable. The AI is never asked to do arithmetic.
* **Gemini decides the words.** The server sends the real plan (budget lines, first tasks, warnings) as context and asks for
  JSON only. Output is parsed, length-limited and stripped of angle brackets before it reaches the browser.
* **Always an answer.** If the API key is missing, the quota is used up, the model is unavailable, the call is slow or the
  answer is malformed, the app shows built-in templates or rule-based answers and says why on screen (for example "no API key set").
* **Model:** the server uses the stable `gemini-3.5-flash-lite` model by default. Set `GEMINI_MODEL` only when deliberately testing another model.
* **Secret:** set `GOOGLE_API_KEY` (preferred) or `GEMINI_API_KEY` in the server environment. The key is sent in the `x-goog-api-key` header, never in the URL or response.
* **Saving work (efficiency):** the same question is never paid for twice.
  * *Server:* real Gemini answers are kept in memory for 10 minutes (up to 200, least recently used first), keyed by plan, day, language and question. A repeat is answered without building a prompt or calling Gemini (`X-Cache: hit`). Identical requests that arrive together share one Gemini call. Fallbacks are never cached, so a retry after an outage can still succeed.
  * *Browser:* the last 12 Gemini answers are remembered for the session, so switching language back, repeating a question chip or refreshing with unchanged details makes no request. If the server reports "no key", "key refused" or "quota used up", the page stops calling it (for the session, or one minute for quota) and shows the built-in answer at once. A request replaced by a newer plan, language or question is cancelled, not just ignored.
  * *Calendar export:* line folding measures UTF-8 size from the code point instead of creating a byte array per character.
* **Abuse control:** the API allows at most 14 requests per minute per client IP in each warm serverless instance. Serverless in-memory limits are best-effort across multiple instances; provider-side quotas still apply.

## Run and test

```bash
npm test            # whole suite: Node 20+ syntax, no dependencies, no network, no API key needed
npm run check       # syntax check of every shipped JavaScript file
npm run coverage    # suite + Node's coverage report; fails if coverage drops below 97% lines, 90% branches, 92% functions (Node 22.8+)
npm run verify      # check + coverage, the same gate CI uses
```

Optional browser test (not part of `npm test`; needs Python): it drives the real page in headless Chromium with the
production Content-Security-Policy, using a fake Gemini, and checks the plan, AI and fallback paths, re-planning, the
calendar download, clipboard, language switch, validation errors, small screens and the 404 page.

```bash
pip install playwright && playwright install chromium
python3 e2e/e2e.py
```

GitHub Actions runs the syntax check and tests on Node.js 22 and 24 for every push and pull request, and enforces the coverage thresholds above on Node 24. Measured locally on Node 22 the suite reaches about 99.9% line, 95.5% branch and 95% function coverage. CodeQL static analysis (security-extended queries) runs separately on pushes, pull requests and a weekly schedule.

Deploy on a compatible Node.js serverless host: add the environment variable `GEMINI_API_KEY` (a key from Google AI Studio), then deploy. There is no build step. `vercel.json` contains Vercel-specific response headers; other hosts must be configured with equivalent headers separately. `404.html` provides a custom not-found page and `favicon.svg` provides the app icon.

## Quality notes (mapped to the evaluation areas)

| Area | What is implemented and what remains |
|---|---|
| Code quality | Content (`data.js`), logic (`core.js`), interface text (`strings.js`), UI wiring (`app.js`) and server (`api/assist.js`) are separated; planning functions are deterministic; no runtime dependencies. |
| Security | API key is read from the server environment and is never returned; JSON body size and fields are validated (numbers must be plain digits, so forms like `0x64` or `1e4` are refused; Bengali digits are accepted); AI output is schema-checked and rendered with `textContent`; same-origin browser requests are checked when an Origin header is present; IP rate limiting avoids trusting caller-supplied `X-Forwarded-For`; CSP and other headers are defined for Vercel. A 429 carries a `Retry-After` header, and an unexpected server error returns only `{"error":"internal_error"}`. The in-memory limiter is best-effort per warm instance, not a distributed abuse-control system. |
| Efficiency | Planning runs locally without network access; AI output is capped at 2,048 tokens (room for Bengali script); identical AI requests are answered from a bounded server cache and a session cache in the browser, concurrent duplicates share one Gemini call, the browser stops calling a server that has no key or quota, and superseded requests are cancelled; requests have a deadline and a deterministic fallback; no runtime dependencies or build step. The per-instance caches are best-effort on serverless, like the rate limiter. |
| Testing | Automated tests cover planning rules, strict input parsing, API validation/fallback/security (including error containment and the rate limiter), translations, markup, contrast, the script-tag load path used by browsers and security-sensitive rendering. CI tests Node.js 22 and 24 and fails the build if coverage drops below the set thresholds. Coverage is not proof of correctness. |
| Accessibility | Semantic landmarks/headings, labelled fields, error summary and field descriptions, live announcements, visible keyboard focus, reduced-motion and forced-colors CSS, 44px touch-target rules and automated WCAG AA colour-contrast checks are present. Automated static checks do not replace manual keyboard, screen-reader, zoom/reflow and real-device testing; those remain release checks. |
| Problem alignment | The core flow gathers event type, date, guest count, budget and dietary needs; creates a budget and dependency-aware timeline; responds to seasonal and scheduling context; and recalculates when dates, costs, attendance or task timing change. |



## Assumptions

* Budget shares per event type, minimum food per guest (₹20 to ₹80 depending on type), the ₹50 minimum total per guest, task
  lead times, the volunteer ratio, rainy months (June to September) and busy booking months (puja: October, November, January,
  February; family events: November to February) are rules of thumb for West Bengal, not official figures.
  They are easy to change in `data.js` and at the top of `core.js`.
* Permissions, loudspeaker rules and prices differ by place. The app only reminds the organiser to ask the local office or vendor.
* Amounts are in Indian rupees; dates use the organiser's local calendar day.
* No user data is stored. Requests are processed and discarded.
* The rate limiter is in memory, so on serverless hosting it is best-effort per warm instance.

## Files

`index.html`, `style.css`, `app.js`, `strings.js` (interface) · `data.js`, `core.js` (content and planning logic) ·
`api/assist.js` (server) · `core.test.js`, `assist.test.js`, `site.test.js` (tests) · `DESIGN.md` (design notes) ·
`vercel.json` (security headers) · `.github/workflows/test.yml` and `codeql.yml` (CI and static analysis) · `SECURITY.md` (how to report a problem) · `.editorconfig` (formatting) · `e2e/` (optional browser test).

## How AI was used

The application calls the **Gemini API** at run time for ideas, tips, the message draft and answers to questions. The code,
tests and this documentation were drafted with **Claude** by prompting and then run and reviewed.