# Deployment

## Preconditions And Ownership

This guide describes a manual release, not a verified live AWS deployment. Use a dedicated target account/region and identify the release owner, alert recipient and data owner. Run [validation](testing.md), review the diff, confirm no secrets, and use a protected state backend before team use. The root currently defaults to local state; add/configure the intended backend explicitly, not an unsupported `-backend-config` against an undeclared remote backend.

```bash
aws sts get-caller-identity
terraform -chdir=infra/aws init
terraform -chdir=infra/aws fmt -check
terraform -chdir=infra/aws validate
```

Supply `TF_VAR_gemini_api_key` and `TF_VAR_nrel_api_key` through a controlled local environment/secret workflow. Do not paste real keys into committed examples, shell history, CI output or chat. Both variables are required; provider calls need usable values, while the local frontend needs neither.

## Plan And Apply

```bash
terraform -chdir=infra/aws plan -out=roofsignal.tfplan
terraform -chdir=infra/aws show roofsignal.tfplan
terraform -chdir=infra/aws apply roofsignal.tfplan
terraform -chdir=infra/aws output
```

Review replacements/deletes, target names, allowed origins/callbacks, IAM, photo retention, concurrency and alarm recipients. Plans/state contain secrets; keep them protected and do not upload them as public CI artifacts. `allowed_origins` defaults include localhost and the demo host; remove development origins for a controlled hosted environment. Cognito callback/logout lists are explicit in `main.tf`; change them with the frontend hostname when needed.

Existing Lambda log groups may have been auto-created; import the exact group before applying the new resource:

```bash
terraform -chdir=infra/aws import aws_cloudwatch_log_group.lambda /aws/lambda/<function-name>
```

Reserved concurrency can fail to provision in accounts without enough unreserved capacity. Review the account quota; `lambda_reserved_concurrency = -1` disables the reservation and removes that cost/blast-radius control. Do not silently relax it.

## Frontend And Accounts

Set frontend configuration from Terraform outputs: `VITE_AWS_API_URL`, `VITE_AWS_REGION`, `VITE_AWS_USER_POOL_CLIENT_ID`, `VITE_AWS_COGNITO_DOMAIN`; `VITE_AWS_USER_POOL_ID` is operator metadata. Vite embeds these at build time. Provider keys stay server-side.

Cloudflare Pages uses Vite, `npm run build`, `dist`, SPA redirects and production branch `main`. Verify project Git settings and deployment logs in Cloudflare. Build the frontend after AWS outputs are stable. The validation workflow does not deploy either platform.

Create the first admin with assigned company/role attributes:

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

Use the actual target region. Invite reps with role `rep`; company IDs must be valid unchanged identifiers. Do not let users self-select tenant/role values.

## Release Smoke And Rollback

Check `/health` (liveness only); unauthenticated protected routes must reject access. Sign in as two different companies and two same-company reps; confirm tenant separation and owner/admin mutation rules. Upload a small real image, save/read a report, inspect the homeowner share response, export a formula-like name safely, then delete and verify the report/share link is unavailable. Photos remain until S3 lifecycle cleanup, and issued image URLs can work until expiry. Exercise provider failure/fallback and logical share expiry. Verify access/request logs and alert delivery without logging credentials.

These cloud smoke checks are a procedure, not results recorded by local tests. If a release fails, restore a known frontend deployment in Cloudflare and review a plan using the previous AWS source revision from a separate checkout. Do not apply a destructive replacement as a blind rollback. [Recovery runbook](runbook.md).
