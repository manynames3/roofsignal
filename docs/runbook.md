# Operations Runbook

This is an operator procedure for the optional AWS workspace. Local tests do not prove a live account, notification delivery or recovery exercise. Before hosted use, assign a release owner, incident contact and data owner; record account/region and environment identifiers outside public source.

## First Checks

1. Confirm the intended AWS identity/region and frontend deployment revision. Read Terraform outputs for API, function and log group names; never include state or secret values in an incident report.
2. Check `GET /health`. It proves handler liveness only, not DynamoDB, S3, Cognito or provider health.
3. Correlate API access records and Lambda JSON logs by request ID. Record status, route template, timestamp and symptom. Follow [observability](observability.md); exclude tokens, signed URLs, photos, addresses and provider response bodies.
4. Decide whether to restore a known release or fix forward. Preserve the original failure evidence and note what checks succeeded afterward.

## Failure Handling

| Symptom                    | Investigation / action                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in fails              | Check exact Cognito callback/logout URLs, deployed frontend environment and invitation status. API tokens are stored in the browser and expire; sign in again.                                                                       |
| 401 / 403                  | Check verified token expiry/audience and assigned company/role. Reps may read company reports, but only owner/admin can overwrite, share, export or delete. Correct attributes with Cognito admin APIs; do not weaken authorization. |
| Photo upload rejected      | Check size/type, signed-policy expiry, S3 CORS origin and POST fields. Regenerate the upload policy; do not make the bucket public. A failed save can leave an orphan until lifecycle expiry.                                        |
| Photo missing after reload | Local mode intentionally omits image bytes. Hosted GET URLs expire after 15 minutes; reload to rehydrate. S3 lifecycle may remove old objects independently of report retention.                                                     |
| Provider unavailable       | Gemini errors leave manual evidence entry available. Census/NREL failure can fall back to stated local assumptions. Inspect the displayed source/warnings; do not present fallback output as provider-validated.                     |
| 429                        | Check API throttling, Lambda concurrency and atomic UTC-day provider counters. Counters include attempts. Review usage before raising limits; there is no automatic client retry loop.                                               |
| Save 409 / 413             | Reload after an ID ownership/creation conflict; this is not full version locking. Reduce an oversized report; payloads are limited to 300 KiB before persistence.                                                                    |
| Save 5xx                   | Check IAM, DynamoDB/SSM availability and function logs. Retry only after checking whether the report was persisted; a later list failure can follow a successful write.                                                              |
| Missing history            | Query is bounded to 50 items in report-ID order, then expired records are filtered. It is not a complete chronological archive. No pagination UI exists.                                                                             |
| Shared link unavailable    | Check link/report expiry and source deletion. Links are bearer credentials. The public response excludes internal fields; allowed captions still require rep review.                                                                 |

## Rollback And Recovery

Frontend: restore a known Cloudflare Pages deployment and smoke-check sample/blank routes. The validation workflow does not perform this action.

AWS: use a separate checkout of a known revision with the intended protected state, review a Terraform plan and restore compatible code/configuration. Check resource replacements and state moves before applying. There is no Lambda alias/canary rollout or one-command rollback. Do not revert tenant/role restrictions to recover availability.

Data: DynamoDB point-in-time recovery, S3 versioning and restore drills are not configured. Deleted/expired data cannot be promised recoverable. Establish backup/export, retention consent and a restore exercise before accepting valuable hosted data. Do not copy customer data into public fixtures.

Secrets: rotate at the provider and update the controlled Terraform/SSM configuration. Warm Lambda instances cache values, so recycle environments through a reviewed deployment. State/plans retain sensitive values; rotating runtime keys does not erase old state copies.

## Ownership Gaps

No on-call schedule, tested alert subscription, incident automation, recovery target or immutable user audit ledger is claimed. Configure `alarm_actions`, verify delivery and own budget monitoring before unattended operation. [Deployment](deployment.md) and [teardown](teardown.md) cover the release and disposal steps.
