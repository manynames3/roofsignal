# Teardown And Data Cleanup

The commands below are procedures, not a record of destruction performed. Confirm the exact account/region, resource names, data owner's approval and any required export before executing them. Terraform defaults to local state; loss of the correct state can strand resources.

## Report And Browser Cleanup

An owner/admin can delete a hosted report. Its share links stop resolving when the report is absent. Share rows remain until TTL cleanup. Photos are retained independently because report snapshots can reference the same object; deleting one report must not break another. Already issued photo URLs can work until their 15-minute expiry. Neither TTL nor S3 lifecycle provides immediate erasure.

For a targeted privacy deletion, an operator must identify all related reports, shares and photo objects, check other references, and remove the approved records/objects. There is no automated tenant erasure workflow. Removing data from AWS does not remove copies already exported, printed or downloaded.

Local reports/settings live in browser site storage. Use the workspace delete action for saved reports or clear this site's storage to remove its local history/profile/session. Local uploads use temporary object URLs; image bytes are not persisted with history.

## AWS Stack Removal

Stop new hosted writes and retain any approved export outside the stack. Confirm identity and list the intended bucket:

```bash
aws sts get-caller-identity
terraform -chdir=infra/aws output -raw photo_bucket
```

The bucket uses `force_destroy = false`; Terraform refuses to destroy a nonempty bucket. Replace `PHOTO_BUCKET` below with the exact output, review its contents, then empty it only after approval. This stack does not configure versioning; check for externally added versions before disposal.

```bash
aws s3 ls "s3://PHOTO_BUCKET" --recursive
aws s3 rm "s3://PHOTO_BUCKET" --recursive
terraform -chdir=infra/aws plan -destroy -out=roofsignal-destroy.tfplan
terraform -chdir=infra/aws show roofsignal-destroy.tfplan
terraform -chdir=infra/aws apply roofsignal-destroy.tfplan
terraform -chdir=infra/aws state list
```

Use the actual region/profile. Review the plan's Cognito, tables, bucket, SSM parameters, API, Lambda, IAM, alarms and managed log groups. Destroying them removes hosted identities/data/configuration, including the managed log history. Export needed diagnostics first. External SNS topics/subscriptions, backups or remote state resources are not owned by this Terraform root.

Verify intended resources are absent in AWS and reconcile billing/resource inventory; an empty state list alone is not sufficient. Revoke provider keys no longer used. Remove local Lambda archives/plans and dispose of protected state copies according to retention requirements. Never commit these artifacts as teardown evidence.

## Cloudflare And Other Copies

AWS destroy does not remove Cloudflare Pages deployments, its optional function secrets, browser storage or exports. Remove hosted frontend settings/deployments/project separately if ending the sample; confirm no other project uses those credentials. Disconnect repository deployment integration as appropriate. Do not remove shared DNS/provider resources blindly.
