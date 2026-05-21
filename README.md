# Roof Signal

Roof Signal is a pre-appointment roof and solar readiness workflow for roofing, solar, and roof+solar sales teams. Reps upload roof photos, enter basic job details, and generate a homeowner-friendly report that recommends whether to lead with solar, roof tune-up, roof replacement, or in-person inspection.

## Current product status

This repository is a client-side MVP. It is suitable for portfolio demos, prospect discovery, and paid-pilot validation after deployment hardening. It is not a licensed roof inspection product and it does not make engineering, permitting, insurance, or structural determinations.

## What works now

- Sales landing page at `/`.
- Report builder at `/app`.
- Multiple roof photo upload with previews and file validation.
- Photo evidence workflow with per-photo captions and rep-confirmed observation tags.
- Property/job intake fields for roof age, material, leaks, existing solar, utility bill status, desired outcome, and rep notes.
- Solar opportunity inputs for usable roof area, roof direction, pitch, panel wattage, and shade.
- Preliminary solar score, estimated DC watts, panel count, annual production, and monthly production chart.
- Transparent rule-based scoring for roof age risk, visible condition risk, leak risk, urgency, solar readiness, data completeness, and lead quality.
- Homeowner-friendly readiness report with transparent scores, photo evidence, homeowner questions, next action, and disclaimer.
- Local report history, company branding fields, print-friendly output, copyable summaries, and demo scenarios.
- Optional server-side Gemini photo evidence suggestions. Suggested tags are not used for scoring or reports until the rep accepts or edits them.

## What is intentionally not built yet

- Server-side storage.
- User accounts and team permissions.
- Hosted share links that work across devices.
- Billing.
- CRM integrations.
- Automatic roof-plane measurement, usable surface area detection, shading analysis, or final solar design.
- Automatic licensed roof inspection or final condition determination from photos.

## Tech stack

- Vite
- React
- TypeScript
- Vitest
- Plain CSS
- npm

## Run locally

```bash
npm install
npm run dev
```

The default dev server starts at `http://localhost:5173`. If that port is busy:

```bash
npm run dev -- --port 5174
```

Open the landing page at `/` and the report builder at `/app`.

For a streamlined demo, open `/app`. It preloads the replacement-first sample case with demo photos, job details, demo company/rep contact information, the limitation acknowledgement, and a generated report. Use `/app?blank=1` for an empty workflow.

## Test and build

```bash
npm test
npm run build
```

## Deploy

The project builds to `dist/` and includes `public/_redirects` so static hosts can serve `/app` through the single-page React app.

For Cloudflare Pages:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Current production URL: `https://roofsignal-readiness-agent.pages.dev`

This repo is connected to Cloudflare Pages for automatic deployments. Pushing to `main` triggers the production build; other branches can create preview builds.

## Environment variables

Copy `.env.example` to `.env.local` if you are experimenting with optional integrations. Do not put production AI provider keys in client-exposed `VITE_*` variables.

Optional solar estimate integration:

- U.S. Census Geocoder is used without a key for address-to-coordinate lookup when a report is generated.
- Add `VITE_NREL_API_KEY` to enable NREL PVWatts V8 production estimates in local/demo mode.
- Without an NREL key or matched address, the app falls back to a local assumption-based solar estimate.
- Final roof area, shade, setbacks, panel layout, and production modeling still require a site survey and installer design tool.

Optional Gemini photo evidence suggestions:

- Add `GEMINI_API_KEY` to `.env.local` for local Vite development.
- Add `GEMINI_API_KEY` as a Cloudflare Pages environment variable for production.
- Optional: set `GEMINI_MODEL`; the default is `gemini-2.5-flash-lite`.
- The browser sends selected roof photos to `/api/photo-evidence-suggestions`. The server-side function sends resized inline images to Gemini and returns suggested captions/tags.
- Gemini suggestions are stored as `vision-suggested` until the rep accepts, edits, or rejects them. Unconfirmed suggestions do not affect scoring and do not appear in homeowner-facing reports.

## Product positioning

Honest claim today:

> Generate a roof/solar readiness report from rep-entered job details, uploaded roof photos, rep-confirmed photo evidence tags, optional Gemini tag suggestions, and preliminary solar opportunity assumptions.

Next production milestone:

> Create branded, saved, shareable pre-appointment roof/solar readiness reports for every rep before quoting.

## AI vision roadmap

Gemini photo evidence suggestions are now connected through a server-side endpoint, but the product still treats AI output as assistive draft evidence. The next implementation phase should:

1. Add provider usage logging, error analytics, and per-report AI provenance.
2. Let reps edit Gemini captions inline before accepting all suggestions.
3. Add a second-pass reviewer prompt for low-confidence or conflicting photo evidence.
4. Add cost controls, rate limits, and team-level enable/disable settings.
5. Keep every report labeled as rule-based, vision-assisted, or manually confirmed so the app never implies a licensed inspection.

## Safety and trust language

Roof Signal provides visible-risk triage and sales sequencing guidance. A qualified roof professional should confirm roof condition before final roof or solar scope. The product should not be positioned as a replacement for a licensed roofer, engineer, inspector, insurance adjuster, utility, or permitting authority.
