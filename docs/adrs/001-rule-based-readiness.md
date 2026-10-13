# ADR 001: Deterministic Readiness Rules

## Status

Accepted.

## Context

Roof/solar appointment preparation needs an explainable recommendation from limited inputs. No validated inspection model or accuracy benchmark exists here.

## Decision

Keep roof risk and recommendation logic as explicit TypeScript rules with focused unit tests. Show inputs, scores, confidence and assumptions in the report.

## Consequences

Rules can be inspected and regression-tested without a model call. They remain heuristics and can reflect bad input or arbitrary thresholds. Hosted reports currently trust browser-authored scoring; server-side validation/versioned rules are a next step.
