# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:
the repository's **Security** tab, then **Report a vulnerability**. Include what you found, how to
reproduce it, and which file or endpoint is affected. A fix is prepared privately and the report is
closed once it is released.

## Rules for contributors

- Do not commit API keys, tokens, passwords, private user data, or `.env` files.
- Configure provider credentials using the hosting platform's secret/configuration manager.
- This repository contains source code only; no live credentials are intended to be included.

## What is already in place

- The Gemini key is read from the server environment only and is never logged or returned.
- Requests are limited to JSON, 8 KB of UTF-8, same-origin, and 14 per minute per client address.
- Model output is parsed, length-limited, stripped of angle brackets and rendered with `textContent`.
- A strict Content-Security-Policy (no inline code, no plugins, https only) and the usual headers are set in `vercel.json`.
- An unexpected server error returns a short JSON message; stack traces are never sent to the browser.
- CodeQL (security-extended queries) and Dependabot run on this repository.