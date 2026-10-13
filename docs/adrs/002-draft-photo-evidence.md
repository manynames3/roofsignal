# ADR 002: AI Output Remains Draft Evidence

## Status

Accepted.

## Context

Gemini can suggest visible tags/captions, but images may be unclear and predictions may be wrong. A suggestion is not professional inspection evidence.

## Decision

Use server-side Gemini calls with constrained categories. Mark output `vision-suggested`; only rep acceptance/editing makes it reportable and eligible for scoring. Keep a manual path when the provider is unavailable.

## Consequences

Human review adds friction but keeps scoring authority explicit. Selected images leave the application for Google. Quotas/timeouts bound some usage; provenance, accuracy evaluation and stricter abuse controls remain incomplete. Gemini API use is intentional; Gemini Code Assist is not used.
