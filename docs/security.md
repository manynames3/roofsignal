# Security Model

## Data And Actors

Reports contain homeowner names/addresses, photos, contact details and rep notes. Cognito invitations assign a company and `admin`/`rep` role. Company peers can read company reports; owners and admins can mutate/delete/share/export them. Public endpoints serve health, access requests and bearer share links. Treat the browser and saved report payload as untrusted input.

## Controls In Source

| Boundary           | Control / evidence                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Invite-only Cognito; 12-character password policy; API Gateway JWT issuer/audience/expiry checks                                    |
| Account attributes | Web client writes only email; company/role are administrator-managed, Lambda rejects missing/invalid claims                         |
| Tenant data        | DynamoDB company partition; exact company upload prefix validation on save and hydration; no caller-selected company on routes      |
| Ownership          | Report owner/admin check for overwrite/delete/share/export; conditional writes prevent claiming an existing ID owned by another rep |
| Uploads            | Signed POST with exact MIME type, 1-byte to 12-MB policy, short expiration; content-type declarations do not prove image content    |
| Sharing            | Expiring opaque token; server-side allowlist removes rep notes, sales guidance, lead quality, browser audit data and storage keys   |
| Storage            | Private S3/public-access blocks, AES256 encryption, TLS-only bucket policy; short-lived presigned reads                             |
| IAM                | Explicit DynamoDB tables, S3 upload objects and two SSM parameter ARNs in the Lambda policy; no admin policy                        |
| Secrets            | Server-side SSM SecureString and runtime cache; no production provider key in `VITE_*`; state still contains secret values          |
| Output             | Spreadsheet formula neutralization in browser and Lambda CSV exports; metadata-only application/provider-error logs                 |
| Usage              | API throttling, Lambda concurrency cap and atomic per-company provider quotas; no guarantee against public endpoint abuse           |

[Backend](../backend/lambda/app.py), [Terraform](../infra/aws/main.tf), [AWS client](../src/lib/awsBackend.ts), [tests](testing.md).

## Network And Blast Radius

There is no VPC/private network boundary. Managed endpoints use HTTPS; Lambda accesses public Census/NREL/Google APIs. CORS limits browser origins but does not authorize a caller. A single Lambda role spans this stack's companies: application authorization bugs can affect multiple tenants. API invoke permission is restricted to this API's execution ARN, but the function still needs broad access within its resource set.

Share URLs and signed photo URLs are bearer credentials. Do not log, paste publicly or include them in bug reports. A forwarded share URL works until expiry; deleting its source report makes it unavailable. No verified homeowner identity or individual share revocation UI exists.

## Secrets And Audit Limits

Terraform `sensitive` masks display; it does not remove values from state or saved plans. `.gitignore` is a guard, not secret detection. Use a protected state backend, least-privilege deploy credentials and a controlled secret injection path before shared deployment. Rotating a provider secret requires recycling Lambda environments to clear the runtime cache.

CloudWatch records request/provider metadata, not a durable domain audit ledger. Browser-authored provenance events can be changed by clients. AWS account CloudTrail settings and data-event logging are not provisioned here; do not claim audited object access or compliance.

## Known Risks And Next Controls

- Implicit OAuth and localStorage tokens expose sessions to XSS and lack PKCE/state protection. Migrate before broader use; the app does not implement a refresh/session backend.
- Readiness scoring is client-authored. Share projection removes known internal fields but cannot classify sensitive content embedded in allowed captions/observations. Reps must review before sharing.
- No malware/content inspection, MFA mandate, WAF, distributed abuse control for access requests, or comprehensive schema validation of reports.
- Demo Gemini is disabled by default. Explicit opt-in plus same-origin/body constraints is still unauthenticated; deploy authenticated AWS usage instead. Photo submission sends selected images to Google.
- No automated secret scanner, Checkov/TFLint or supply-chain attestation. Dependency audit results are recorded only when actually run.
- One-region data, default local state, no automated restore verification. [Recovery and ownership](runbook.md).
