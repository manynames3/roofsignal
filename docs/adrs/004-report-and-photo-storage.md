# ADR 004: DynamoDB Reports And Private S3 Photos

## Status

Accepted.

## Context

Reports are small structured snapshots; images are larger binary objects. Routing both through one API payload would waste bandwidth and strain limits.

## Decision

Store bounded report JSON under a company/report key in on-demand DynamoDB. Upload images directly to private S3 using a signed POST policy with type/size constraints. Validate company prefixes before saving or presigning. Use logical report/share expiration and S3 lifecycle retention.

## Consequences

No always-on database host; images bypass the report route. Writes across S3/DynamoDB are not atomic. Interrupted saves can leave orphan uploads until lifecycle cleanup. Queries lack full pagination; nested JSON limits selective updates. TTL/lifecycle are asynchronous, not immediate erasure guarantees. Reports are snapshots, not transactional CRM records.
