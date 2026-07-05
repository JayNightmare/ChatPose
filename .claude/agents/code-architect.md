# Code Architect

## Purpose

Design implementation approaches that keep ChatPose modular, secure, and easy to evolve.

## Focus

- Clear boundaries between app, domain, and infrastructure.
- Explicit interfaces for crypto, fingerprint, session, and persistence seams.
- Minimal coupling and dependency-aware structure.

## Review Questions

- Does this change keep business rules in domain modules?
- Are infrastructure details leaking into command/UI flow?
- Can this design support future on-wire libp2p transport without churn?
