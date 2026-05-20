# RoofSignal Readiness Agent

RoofSignal is a pre-appointment roof and solar readiness workflow for roofing, solar, and roof+solar sales teams. Reps upload roof photos, enter basic job details, and generate a homeowner-friendly report that recommends whether to lead with solar, roof tune-up, roof replacement, or in-person inspection.

## Current product status

This repository is a client-side MVP. It is suitable for portfolio demos, prospect discovery, and paid-pilot validation after deployment hardening. It is not a licensed roof inspection product and it does not make engineering, permitting, insurance, or structural determinations.

## What works now

- Sales landing page at `/`.
- Report builder at `/app`.
- Multiple roof photo upload with previews and file validation.
- Property/job intake fields for roof age, material, leaks, existing solar, utility bill status, desired outcome, and rep notes.
- Transparent rule-based scoring for roof age risk, visible condition risk, leak risk, urgency, solar readiness, data completeness, and lead quality.
- Homeowner-friendly readiness report with rep guidance and disclaimer.
- Local report history, company branding fields, print-friendly output, copyable summaries, and demo scenarios.

## What is intentionally not built yet

- Server-side storage.
- User accounts and team permissions.
- Hosted share links that work across devices.
- Billing.
- CRM integrations.
- Real AI vision analysis.

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

For a streamlined demo, open `/app`. It preloads the replacement-first sample case with demo photos, job details, the limitation acknowledgement, and a generated report. Use `/app?blank=1` for an empty workflow.

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

Copy `.env.example` to `.env.local` if you are experimenting with future integrations. Do not put production AI provider keys in client-exposed `VITE_*` variables. Real vision analysis should run through a server-side API route or backend function.

## Product positioning

Honest claim today:

> Generate a rule-based roof/solar readiness report from rep-entered job details and uploaded roof photos.

Next production milestone:

> Create branded, saved, shareable pre-appointment roof/solar readiness reports for every rep before quoting.

## Safety and trust language

RoofSignal provides visible-risk triage and sales sequencing guidance. A qualified roof professional should confirm roof condition before final roof or solar scope. The product should not be positioned as a replacement for a licensed roofer, engineer, inspector, insurance adjuster, utility, or permitting authority.
