# Reviewer Guide

## First Five Minutes

Open the [live sample](https://roofsignal-readiness-agent.pages.dev/app?demo=replacement-first#report), then read [architecture](architecture.md), [Lambda authorization](../backend/lambda/app.py), [Terraform](../infra/aws/main.tf) and [CI](../.github/workflows/validate.yml). Deployed content can differ from the local branch.

This sample demonstrates business-to-rule translation, an AWS hosted data path, authorization beyond login, and documented operational limits. It does not prove production traffic, customer outcomes, AI accuracy, on-call performance or exercised disaster recovery.

## Evidence Map

| Area           | Files / questions                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Infrastructure | `infra/aws/main.tf`, `variables.tf`, `outputs.tf`: IAM scopes, TTL/lifecycle, logs, quotas and concurrency                    |
| Backend        | `backend/lambda/app.py`: company/owner checks, photo-key validation, share projection, upload policy and provider quotas      |
| Frontend       | `src/App.tsx`, `src/styles.css`: navigation, sample labeling, stale snapshots, homeowner/internal and responsive/print states |
| Domain         | `src/lib/roofReadiness.ts`, `solarOpportunity.ts`: thresholds, assumptions and fallback behavior                              |
| Tests          | `src/lib/*.test.ts`, `backend/tests/`, function tests: assertions and mock boundaries                                         |
| Delivery       | `.github/workflows/validate.yml`, `docs/deployment.md`: credential-free checks, manual release                                |
| Operations     | `docs/runbook.md`, `observability.md`, `cost-model.md`, `teardown.md`: failures, alerts, recovery and cleanup                 |

## Run And Inspect

Use the [quickstart](../README.md#local-quickstart) and [testing commands](testing.md). Terraform validation checks configuration, not cloud permissions or runtime behavior. Change an input after generating: the saved report stays visible and stale until regeneration. In a configured hosted environment, inspect the shared API response itself for redaction; hiding UI alone is insufficient. Backend tests exercise foreign-company keys and owner/admin mutations.

## Strong Decisions

- Human confirmation separates AI assistance from scoring authority. [ADR 002](adrs/002-draft-photo-evidence.md).
- Edge delivery and AWS data ownership keep frontend delivery small while exposing the cloud boundary. [ADR 003](adrs/003-cloudflare-and-aws.md).
- Direct private uploads reduce API payload pressure, with non-atomic photo/report writes as a tradeoff.
- On-demand services reduce idle infrastructure; quotas/concurrency help contain bursts without guaranteeing spend ceilings.
- One Lambda is inspectable; shared IAM and duplicated solar logic increase future maintenance risk. [Tradeoffs](tradeoffs.md).

## Incomplete Or Demo-Only

Sample homeowner/company details are fictional. Local history omits image bytes. Rules are heuristics. Browser provenance is editable JSON. Provider keys and AWS resources are optional; a static demo does not prove provisioned services. No cloud integration/e2e suite, security policy scanner, automatic AWS rollout, dashboard, tracing, recovery exercise or confirmed alert recipient is claimed.

Before unattended hosted use: authorization code + PKCE, server-side score validation, immutable audit events, report pagination, remote state, backups, alert/budget routing, provider abuse controls and integration/parity tests. Record image provenance. These are visible gaps, not completed capabilities.
