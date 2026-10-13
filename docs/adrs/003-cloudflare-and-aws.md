# ADR 003: Cloudflare Frontend And AWS Hosted Backend

## Status

Accepted.

## Context

The existing SPA deploys to Cloudflare Pages. Hosted identity, records, private images and provider access need server-side ownership.

## Decision

Keep static delivery on Pages and provision API Gateway, Lambda, Cognito, DynamoDB, S3 and SSM with Terraform. Keep the no-credential browser demo separate from optional hosted configuration.

## Consequences

Frontend delivery stays simple; cloud ownership is inspectable. Cross-provider CORS, callback configuration, releases and teardown need coordination. Terraform does not manage Cloudflare settings. Moving frontend delivery to AWS would be a separate decision, not required to demonstrate this backend.
