# CelebrAI — AI Event Planner

CelebrAI helps people in India draft an event plan with an INR budget breakdown, checklist, timeline, personalized ideas, and a plan review.

**Live app:** https://celebrai-ai-event.hatchable.site

## Features
- Event planning for birthdays, weddings, community events, and other celebrations.
- Budget allocation with server-side validation and budget-cap protection.
- Planning checklist and timeline.
- Review endpoint with deterministic budget/schedule/inclusion/risk checks and AI synthesis.
- Fallback starter plan if the AI provider is unavailable.

## Source layout
- `public/index.html` — app markup
- `public/app.js` — browser-side application logic
- `public/style.css`, `public/extra.css` — styles
- `api/plan.js` — plan-generation endpoint
- `api/review.js` — plan-review endpoint
- `hatchable.toml` — Hatchable AI configuration

## Run / deploy
This source targets Hatchable's file-based runtime and SDK. It is not a standalone Node/npm app; deploy it on Hatchable or adapt the API handlers to your chosen host.

1. Import or copy the files into a Hatchable project.
2. Configure the required AI provider/key through Hatchable project setup. Never commit real API keys.
3. Run the platform dry-run validator.
4. Deploy, then test the plan and review flows with valid and invalid inputs.

## API
- `POST /api/plan` — expects `event_type`, `guests`, `budget` and optional event details.
- `POST /api/review` — expects `plan` and `event` objects.

## Verification notes
The live deployment was smoke-tested for a successful plan response and validation of an invalid guest count. The AI response may use the Hatchable-managed Gemini provider; the exact model ID is not guaranteed unless the project owner configures a direct Google Gemini API key and verifies provider logs.

## Demo video
A public/unlisted demo video has not been uploaded from this repository. Record the deployed app in a browser, show event input → generated plan → review, and publish it as Unlisted/Public before adding the URL here.

## Challenge submission
Verify the official challenge portal's exact submission form, eligibility, deliverables, and deadline before submitting. The public PromptWars registration listing is not necessarily the deadline for an individual challenge task.
