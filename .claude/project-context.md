# Project Context for Claude

## Project

ChatPose is a terminal-first secure P2P chat foundation.

## Guardrails

- Preserve strict fingerprint-gated login behavior.
- Keep all message persistence ciphertext-only.
- Enforce exactly two peers per session.
- Do not introduce browser analytics or cookie-like tracking.

## Core Modules

- App orchestration: src/app/application.ts
- Fingerprinting: src/domain/fingerprint-service.ts
- Crypto envelope: src/domain/crypto-service.ts
- P2P scaffold: src/infrastructure/libp2p-service.ts
- SQL store: src/infrastructure/sql-store.ts
