# CelebrAI — AI Event Planner

**Live app:** https://celebrai-ai-event.hatchable.site  
**Repository:** https://github.com/chillicoolo200-bit/hash

## Solution vertical and persona

**Proposed vertical:** Event planning / personal productivity assistant. CelebrAI serves as a practical co-planner for a person organizing a birthday, wedding, community gathering, or other celebration in India. It helps users turn their event context, guest count, budget, location, date, and preferences into an actionable starter plan.

**Important submission note:** The challenge portal's complete list of allowed verticals could not be independently verified from the public page. Before submitting, confirm that event planning is an allowed vertical for the selected challenge. If the challenge requires a different persona/problem statement, adapt the app and this README to that exact statement.

## Problem and approach

Planning an event requires coordinating a budget, tasks, timing, inclusion needs, and practical risks. CelebrAI combines a context-aware plan generator with a second-pass quality review.

1. Collect event type, optional event name/date/location, guest count, budget in INR, and preferences.
2. Validate numeric inputs and bound free-text lengths on the server.
3. Ask the configured AI provider to return structured JSON containing budget categories, checklist items, timeline milestones, personalized ideas, and practical tips.
4. Validate the response shape and normalize budget allocations so the plan does not exceed the stated budget.
5. Run a separate review endpoint that performs deterministic budget, schedule, inclusion, and risk checks, then asks the AI provider to synthesize the findings into prioritized actions.
6. If plan generation is unavailable, return a clearly labeled starter template rather than pretending it is a personalized AI result.

## How it works

### Frontend
- `public/index.html` — accessible page structure and event input form.
- `public/app.js` — form state, API calls, plan rendering, navigation, checklist progress, and local draft persistence.
- `public/style.css`, `public/extra.css` — responsive visual styling.

### Backend
- `api/plan.js` — validates event input, generates a plan, validates the returned structure, and caps budget allocations.
- `api/review.js` — validates the supplied plan and event context, runs deterministic audits, and generates prioritized review feedback.
- `hatchable.toml` — Hatchable AI runtime configuration.

### API contracts
- `POST /api/plan`: accepts `event_type`, `guests`, `budget`, and optional event details.
- `POST /api/review`: accepts `plan` and `event` objects.

## Logical decision-making and context

- Event type influences the starter template and suggestions.
- Guest count and budget determine the per-person budget context.
- Location and user preferences are passed into the planning prompt.
- The review logic checks overspending, remaining budget, duplicate categories, date format/past dates, dietary needs, accessibility, weather backup for outdoor events, supplier confirmation, contingency, and safety considerations for large gatherings.
- The review's readiness score is an estimate, not a certification or guarantee.

## Assumptions and limitations

- Currency is INR and the initial target context is India.
- Budget amounts and planning suggestions are estimates, not live quotes.
- CelebrAI does not verify vendor identity, prices, availability, bookings, permits, or venue accessibility. Users must confirm these directly.
- Date scheduling uses the supplied date; if no date is provided, the app offers relative planning milestones.
- The deployed app may use Hatchable's managed Gemini provider. The exact model ID is not guaranteed unless a direct Gemini API key is configured and the provider response/logs are checked.
- The deployed API is public and currently does not require app-user authentication. Do not submit sensitive personal information.
- Draft and checklist persistence uses browser local storage on the current device.

## Security, accessibility, and maintainability

- Server-side validation rejects out-of-range guest counts and budgets.
- Free-text input lengths are bounded and angle brackets are removed before values are used in prompts.
- User-provided content is treated as data rather than instructions in the planning/review prompts.
- The frontend escapes AI-provided text before inserting it into HTML.
- No API key should be committed to this repository. Configure secrets through the hosting platform's secure settings.
- The UI uses semantic form controls and responsive CSS; accessibility should still be verified manually with keyboard-only navigation, visible focus, zoom, and a screen reader before final submission.

## Testing performed

The following live endpoint smoke tests passed during project verification:
- `POST /api/plan` with valid event input: HTTP 200.
- `POST /api/plan` with an invalid guest count: HTTP 400.
- `POST /api/review` with valid event/plan input: HTTP 200.
- `POST /api/review` with invalid guest count: HTTP 400.
- Hatchable dry-run deploy validation: no errors or warnings.

These are smoke tests, not a complete automated test suite. Browser-based end-to-end, accessibility, and cross-device tests remain to be completed.

## Run / deploy

This source targets Hatchable's file-based runtime and SDK; it is not a standalone Node/npm app.

1. Import or copy these files into a Hatchable project.
2. Configure the AI provider/key through secure project settings; never commit a real key.
3. Run the platform dry-run validator.
4. Deploy, then test both endpoints with valid and invalid inputs.
5. Test the full browser flow: enter event details → generate plan → review plan → tick checklist items → reload and verify saved draft behavior.

## Demo video

A public/unlisted demo video has not yet been uploaded from this repository. Before submission, record the live app showing event input, generated plan, budget/checklist/timeline, and plan review. Publish the video as Public or Unlisted if accepted by the portal, and add the link here.

## Challenge submission checklist

- [ ] Confirm the exact allowed challenge vertical/persona in the authenticated portal.
- [ ] Confirm the challenge deadline and all required form fields.
- [ ] Keep the repository public and on one branch only.
- [ ] Verify the full Git repository/ZIP is below 10 MB.
- [ ] Add the final demo-video URL.
- [ ] Run the browser and accessibility checks.
- [ ] Submit only after reviewing the final repository and links; the portal states that only three attempts are allowed.
