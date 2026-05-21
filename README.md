# Roof Signal

Roof Signal is a pre-appointment roof and solar readiness workflow for roofing, solar, and roof+solar sales teams. Reps upload roof photos, enter basic job details, and generate a homeowner-friendly report that recommends whether to lead with solar, roof tune-up, roof replacement, or in-person inspection.

## Current product status

This repository now supports both a client-side demo mode and an AWS hosted pilot mode. It is suitable for portfolio demos, prospect discovery, and controlled paid-pilot validation. It is not a licensed roof inspection product and it does not make engineering, permitting, insurance, or structural determinations.

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
- AWS hosted backend: Cognito invite-only sign-in, DynamoDB saved reports, S3 private photo storage, hosted share links, server-side NREL/Gemini proxying, request-access intake, and CSV export.

## What is intentionally not built yet

- Stripe billing.
- Direct CRM integrations.
- Automatic roof-plane measurement, usable surface area detection, shading analysis, or final solar design.
- Automatic licensed roof inspection or final condition determination from photos.

## Tech stack

- Vite
- React
- TypeScript
- Vitest
- Plain CSS
- npm
- AWS Lambda, API Gateway HTTP API, Cognito, DynamoDB, S3, SSM Parameter Store, and Terraform for hosted mode

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

Optional local solar estimate integration:

- U.S. Census Geocoder is used without a key for address-to-coordinate lookup when a report is generated.
- Add `VITE_NREL_API_KEY` to enable browser-side NREL PVWatts V8 production estimates in local/demo mode.
- Without an NREL key or matched address, the app falls back to a local assumption-based solar estimate.
- Final roof area, shade, setbacks, panel layout, and production modeling still require a site survey and installer design tool.
- In hosted mode, the frontend calls the AWS `/solar-estimate` endpoint so the NREL key is not embedded in the browser bundle.

Optional Gemini photo evidence suggestions:

- Add `GEMINI_API_KEY` to `.env.local` only if you want to test the local/Cloudflare function path.
- In hosted AWS mode, Terraform stores the Gemini key in SSM and the signed-in app calls the AWS `/photo-evidence-suggestions` endpoint.
- Do not add a production Gemini key to Cloudflare Pages unless you intentionally want the unauthenticated demo function enabled.
- Optional: set `GEMINI_MODEL`; the default is `gemini-2.5-flash-lite`.
- In unauthenticated demo mode, the browser sends selected roof photos to `/api/photo-evidence-suggestions`. In hosted mode, the browser sends resized images to the authenticated AWS endpoint.
- Gemini suggestions are stored as `vision-suggested` until the rep accepts, edits, or rejects them. Unconfirmed suggestions do not affect scoring and do not appear in homeowner-facing reports.

AWS hosted backend variables:

- `VITE_AWS_API_URL`
- `VITE_AWS_REGION`
- `VITE_AWS_USER_POOL_ID`
- `VITE_AWS_USER_POOL_CLIENT_ID`
- `VITE_AWS_COGNITO_DOMAIN`

Create/update the AWS backend:

```bash
terraform -chdir=infra/aws init
TF_VAR_gemini_api_key=... TF_VAR_nrel_api_key=... terraform -chdir=infra/aws apply
terraform -chdir=infra/aws output
```

Create the first company admin:

```bash
aws cognito-idp admin-create-user \
  --region us-east-1 \
  --user-pool-id <user-pool-id> \
  --username <work-email> \
  --user-attributes \
    Name=email,Value=<work-email> \
    Name=email_verified,Value=true \
    Name=custom:companyId,Value=<company-slug> \
    Name=custom:role,Value=admin
```

Hosted data policy:

- Reports are stored in DynamoDB with a default 90-day TTL.
- Uploaded roof photos are stored in a private S3 bucket with server-side encryption and a default 90-day lifecycle expiration.
- Photo access uses short-lived presigned URLs.
- Share links are stored separately with a default 30-day TTL.
- Gemini and NREL calls are server-side and daily-limited per company in DynamoDB.

## Product positioning

Honest claim today:

> Generate a roof/solar readiness report from rep-entered job details, uploaded roof photos, rep-confirmed photo evidence tags, optional Gemini tag suggestions, and preliminary solar opportunity assumptions.

Next production milestone:

> Create branded, saved, shareable pre-appointment roof/solar readiness reports for every rep before quoting, with private photo storage and company-separated hosted accounts.

## AI vision roadmap

Gemini photo evidence suggestions are now connected through a server-side endpoint, but the product still treats AI output as assistive draft evidence. The next implementation phase should:

1. Add provider usage logging, error analytics, and per-report AI provenance.
2. Let reps edit Gemini captions inline before accepting all suggestions.
3. Add a second-pass reviewer prompt for low-confidence or conflicting photo evidence.
4. Add cost controls, rate limits, and team-level enable/disable settings.
5. Keep every report labeled as rule-based, vision-assisted, or manually confirmed so the app never implies a licensed inspection.

## Safety and trust language

Roof Signal provides visible-risk triage and sales sequencing guidance. A qualified roof professional should confirm roof condition before final roof or solar scope. The product should not be positioned as a replacement for a licensed roofer, engineer, inspector, insurance adjuster, utility, or permitting authority.
