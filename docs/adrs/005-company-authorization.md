# ADR 005: Company And Owner Authorization

## Status

Accepted, with browser authentication modernization deferred.

## Context

Hosted reports include addresses and photos. Login alone does not prevent a user selecting another company's keys or another rep's report ID.

## Decision

Use invite-only Cognito with administrator-assigned company/role attributes. Restrict app-client writes to email. API Gateway validates JWTs; Lambda requires valid company/role claims, scopes storage access by company, and permits mutations by report owner or company admin. Public shares expose an allowlisted homeowner projection.

## Consequences

Authorization is independently tested and fails closed on missing claims. A shared Lambda IAM role still spans all tenants, so an application bug can have multi-company impact. Bearer share links can be forwarded. Implicit OAuth and local token storage remain risks; PKCE and stronger session handling are the next authentication milestone.
