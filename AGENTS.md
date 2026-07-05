# Project Context for AI Agents

## Mission

ChatPose is a terminal-first secure chat platform prototype focused on strict identity binding, 1:1 encrypted sessions, and ciphertext-only persistence patterns suitable for TDE-backed SQL Server deployments.

This repository is the delivery surface for:

- application orchestration
- terminal user experience
- crypto and identity services
- persistence and session governance

## Architecture

- Runtime: Node.js + TypeScript
- Interface: Blessed terminal UI with command-driven screens
- Network seam: libp2p scaffolding for peer sessions
- Data layer: SQL Server-compatible schema and parameterized writes
- Security model: strict fingerprint gating + encrypted payload envelopes + replay-token checks

## Key Files

- [src/app/application.ts](src/app/application.ts): CLI flow, command routing, session lifecycle
- [src/ui/terminal-ui.ts](src/ui/terminal-ui.ts): terminal rendering layer
- [src/domain/fingerprint-service.ts](src/domain/fingerprint-service.ts): host-trait hashing and fingerprint derivation
- [src/domain/crypto-service.ts](src/domain/crypto-service.ts): message and file-chunk envelope crypto
- [src/domain/session-guard.ts](src/domain/session-guard.ts): 1:1 binding and replay protection
- [src/infrastructure/libp2p-service.ts](src/infrastructure/libp2p-service.ts): P2P node bootstrap seam
- [src/infrastructure/sql-store.ts](src/infrastructure/sql-store.ts): persistence boundary and schema bootstrap

## Non-Negotiables

- Never log plaintext secrets, host traits, message plaintext, or decrypted file bytes.
- Keep message and file payloads encrypted before persistence or transfer.
- Preserve strict 1:1 session invariant at runtime and persistence boundaries.
- Keep key material ephemeral in memory; do not persist session keys.
- Avoid broad, unrelated refactors while implementing features.

## Task Routing

- UI flow and command UX: app and ui modules
- Cryptography and identity: domain modules
- Session enforcement and persistence: infrastructure modules
- Process and governance: root markdown docs and ADRs

## Mandatory Checks Before Merge

1. npm run lint
2. npm run typecheck
3. npm test
4. npm run security:audit

## Definition of Done

- Behavior implemented and manually smoke-tested
- Security assumptions updated if behavior changed
- Unit tests added or updated for risk-bearing logic
- Docs updated: README, TESTING, DEVLOG, and AGENTS when applicable
