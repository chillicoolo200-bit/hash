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
* **Model names change**, so the handler tries `gemini-flash-latest`, then `gemini-3.5-flash-lite`, then `gemini-3.6-flash`.
  Override with `GEMINI_MODEL` (comma-separated).

## Run and test

```bash
npm test            # 79 tests, Node 20+, no dependencies, no network, no API key needed
npm run coverage    # same, with Node's built-in coverage report
```

GitHub Actions runs the tests on every push (`.github/workflows/test.yml`).
Deploy on Vercel: import this repository, add the environment variable `GEMINI_API_KEY`
(a free key from Google AI Studio), deploy. There is no build step.

## Quality notes (mapped to the evaluation areas)

| Area | What was done |
|---|---|
| Code quality | Content (`data.js`), logic (`core.js`), interface text (`strings.js`), UI wiring (`app.js`) and server (`api/assist.js`) are separate, each small and documented; pure functions; no dependencies. |
| Security | API key only in an environment variable, never returned or logged; only JSON bodies up to 8 KB; every input validated and length-limited; free text (notes, questions) is sent to the model as quoted data with an instruction not to follow it; AI output is sanitised and rendered with `textContent` (never `innerHTML`); strict Content-Security-Policy, HSTS and other headers in `vercel.json`; per-IP rate limit; a test scans the repository for key-shaped strings. |
| Efficiency | One AI call per plan or question, 8.5 s deadline, plan computed in the browser, no build step, no runtime dependencies. |
| Testing | 79 tests: planning logic (budget always adds up, dependency order, compression, re-planning, context rules, calendar file validity), the API with a fake Gemini (success, model fallback, 403/429, timeout, malformed output, prompt-injection text, size and content-type limits, rate limit, key never leaks), and static checks of the interface (labels, ids, heading order, CSP-safe markup, translation completeness, colour contrast). |
| Accessibility | Semantic landmarks and headings, labelled fields, error summary whose items focus the field, `aria-describedby`, live regions for status, focus moved to results and answers, keyboard-visible focus ring, 44px touch targets, text (not colour) for status, `lang` switches with the language, WCAG AA colour contrast (tested), forced-colors and high-contrast support, reduced motion, `noscript` message, print stylesheet. |
| Problem alignment | A dynamic assistant that asks occasion, budget and headcount, turns a vague goal into an ordered task list, decides from context (season, crowd, diet, time left), and re-plans when a booking is delayed. |

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
`vercel.json` (security headers) · `.github/workflows/test.yml` (CI).

## How AI was used

The application calls the **Gemini API** at run time for ideas, tips, the message draft and answers to questions. The code,
tests and this documentation were drafted with **Claude** by prompting and then run and reviewed.