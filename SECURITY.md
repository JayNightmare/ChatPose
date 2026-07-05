# Security Policy

## Supported Versions

This project is pre-1.0.0. Security fixes target the latest main branch.

## Reporting a Vulnerability

- Do not disclose vulnerabilities publicly before triage.
- Report with reproduction steps, impact, and proof-of-concept.
- Include affected files and suspected exploit path.

## Security Model Baseline

- Strict fingerprint gating: login requires host-bound fingerprint match.
- End-to-end envelope encryption before message persistence.
- Minimal metadata policy for storage and logs.
- No cookie or browser-tracker surface by design.
- SQL data at rest expected to be protected with TDE.

## Hardening Checklist

- Rotate `APP_MASTER_SECRET` securely.
- Add replay cache enforcement for production.
- Add signed key-exchange handshake for peers.
- Add secure user recovery workflow for fingerprint drift.
- Ensure SQL parameterized queries only.

## Not in Scope Yet

- Complete forward-secret session ratcheting.
- Full peer authentication PKI lifecycle.
- Formal third-party security audit.
