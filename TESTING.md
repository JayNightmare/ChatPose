# Testing and Verification

The verification file for local development and change validation.

## Quick Start

1. npm install
2. cp .env.example .env
3. Fill APP_MASTER_SECRET and runtime values
4. npm run dev

## Baseline Health Checks

- App starts and renders terminal UI without runtime errors
- Login/signup/message-board commands are available via help
- Invalid commands fail safely with guidance text

## Automated Checks

Run these in order:

1. npm run typecheck
2. npm run lint
3. npm test
4. npm run build

## Current Test Coverage

- [tests/crypto-service.test.ts](tests/crypto-service.test.ts)
 	- message encryption/decryption roundtrip
 	- signature tamper detection
 	- encrypted file chunk roundtrip
- [tests/session-guard.test.ts](tests/session-guard.test.ts)
 	- strict two-peer binding
 	- replay-token duplication rejection

## Manual Security Smokes

1. Signup emits fingerprint and transitions to login screen
2. Login rejects mismatched fingerprint
3. connect binds one peer; second different peer is rejected until disconnect
4. send fails unless logged in with active peer binding
5. sendfile fails safely when path is invalid
6. SQL mode persists encrypted fields only (when configured)

## Integration Test Plan

- libp2p two-node local harness for encrypted envelope transfer
- SQL integration tests with seeded sessions and ciphertext assertions
- replay-token persistence tests for cross-runtime rejection

## Milestone Exit Criteria

- Typecheck/lint/test/build all pass
- No plaintext sensitive material appears in logs or persistence path
- README/AGENTS/DEVLOG/TESTING reflect shipped behavior
