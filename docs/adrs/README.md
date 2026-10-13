# Architecture Decision Records

Accepted means reflected in source, not proof of deployment or production readiness.

| ADR                                    | Decision                                                |
| -------------------------------------- | ------------------------------------------------------- |
| [001](001-rule-based-readiness.md)     | Deterministic readiness rules                           |
| [002](002-draft-photo-evidence.md)     | AI output remains draft evidence                        |
| [003](003-cloudflare-and-aws.md)       | Cloudflare frontend, AWS hosted backend                 |
| [004](004-report-and-photo-storage.md) | DynamoDB JSON reports, direct private S3 uploads        |
| [005](005-company-authorization.md)    | Cognito invitations and application tenant/owner checks |

New decisions should state context, decision and consequences, including operational costs and migration risks. Do not rewrite a decision merely to hide a changed assumption.
