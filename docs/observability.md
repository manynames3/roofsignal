# Observability

## Implemented Configuration

Terraform declares dedicated Lambda and API access log groups with 14-day retention. Lambda emits JSON request metadata: request ID, method, route template, HTTP status and duration. Report/share identifiers are redacted in route templates. Provider failures log provider/status or exception type, not response bodies, keys or customer content.

API access logs contain request ID, route key, status, integration status and response timing. Inspect [Terraform](../infra/aws/main.tf) for the exact format. Application logs and access logs help correlate a request; they are not distributed traces or a user activity audit.

Three CloudWatch alarms detect at least one event in a five-minute window: Lambda invocation errors, Lambda throttles and API HTTP 5xx. Caught application exceptions return a 500 without incrementing Lambda's Errors metric, so the separate API alarm matters. Missing data is treated as non-breaching.

`alarm_actions` defaults to empty: alarms can change state but notify nobody. Supply existing SNS/action ARNs and verify subscription delivery before relying on unattended operation. This repo does not create an incident channel or prove alert delivery.

## First Investigation

Obtain log group names/function/API identifiers from Terraform outputs. In CloudWatch Logs Insights for the Lambda group:

```text
fields @timestamp, requestId, method, path, status, durationMs
| filter event = "request"
| sort @timestamp desc
| limit 100
```

For provider failures, filter `event = "provider_error"`. Match request IDs with API access records. Do not turn on body/token/URL logging to debug a customer issue.

## Missing And Proposed

No provisioned dashboard, X-Ray/OpenTelemetry trace, custom latency/provider spend metric, SLO burn-rate alert, synthetic canary or log export. No measured latency/availability figure is claimed. Before a hosted rollout, assign an alert owner, test delivery, baseline normal error/latency behavior, then tune alarm thresholds. Add privacy-safe business audit events independently from diagnostic logs.

Existing auto-created Lambda log groups must be imported before Terraform manages them; [deployment guide](deployment.md). A log group declaration is not evidence that logs currently exist in AWS.
