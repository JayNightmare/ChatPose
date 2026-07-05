# ADR 0002: Strict Fingerprint Gating

## Status

Accepted

## Context

Authentication should bind identity to host characteristics for higher trust in secure sessions.

## Decision

Use strict host-bound fingerprint matching at login.

## Consequences

- Higher resistance to account takeover from copied credentials.
- Increased risk of lockout after hardware/network changes.
- Requires recovery and rebind policy before production rollout.
