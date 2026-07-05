# ChatPose

Terminal-first secure P2P chat foundation with strict host-bound identity, end-to-end encrypted payload envelopes, and SQL persistence designed for TDE-backed operation.

## Mission

Deliver a maintainable and secure baseline for:

- Login using a unique digital fingerprint
- Signup that binds identity to hashed host traits
- Message-board sessions that remain strictly one-to-one
- Encrypted message and file transport with replay protections

## Current Product Shape

- Interface: command-style terminal UI with three screens (login, signup, message-board)
- Networking: libp2p bootstrap seam and peer identity handling
- Security: AES-GCM encrypted envelopes + HMAC signatures + replay-token checks
- Data: SQL Server schema and parameterized writes for encrypted payload storage

## Quick Start

Prerequisites:

- Node.js 20+
- npm 10+

Setup:

1. npm install
2. cp .env.example .env
3. Fill required values in .env (especially APP_MASTER_SECRET)
4. npm run dev

Build and run:

1. npm run build
2. npm start

## Database Configuration

ChatPose now supports two SQL dialects:

- mysql (Cloud SQL for MySQL)
- mssql (SQL Server)

Key environment variables:

- SQL_DIALECT=mysql|mssql
- SQL_SERVER
- SQL_PORT
- SQL_DATABASE
- SQL_USER
- SQL_PASSWORD

Cloud SQL for MySQL example (your current setup):

- SQL_DIALECT=mysql
- SQL_SERVER=34.105.146.153
- SQL_PORT=3306
- SQL_DATABASE=<your-database-name>
- SQL_USER=<your-user>
- SQL_PASSWORD=<your-password>
- SQL_SSL=false (set true if you enable SSL requirements)

## Command Surface

- help
- goto login|signup|message-board
- signup <email>
- login <fingerprint>
- connect <peer-id>
- disconnect
- send <message>
- sendfile <path>
- show fingerprint

## Scripts

- npm run dev
- npm run build
- npm start
- npm run lint
- npm run typecheck
- npm test
- npm run security:audit

## Architecture Overview

- App orchestration: [src/app/application.ts](src/app/application.ts)
- Terminal rendering: [src/ui/terminal-ui.ts](src/ui/terminal-ui.ts)
- Fingerprint service: [src/domain/fingerprint-service.ts](src/domain/fingerprint-service.ts)
- Crypto envelopes: [src/domain/crypto-service.ts](src/domain/crypto-service.ts)
- Session and replay guard: [src/domain/session-guard.ts](src/domain/session-guard.ts)
- P2P seam: [src/infrastructure/libp2p-service.ts](src/infrastructure/libp2p-service.ts)
- SQL persistence seam: [src/infrastructure/sql-store.ts](src/infrastructure/sql-store.ts)

## Security Baseline

- No browser cookies or trackers by architecture
- Host traits are hashed and encrypted, not stored in plaintext
- Message/file payloads are encrypted before persistence
- Session keys are runtime-memory only
- SQL deployment should use provider at-rest encryption and least-privilege DB users

## Limits in This Phase

- Full on-wire libp2p message/file exchange is not complete yet
- Replay protections are runtime-only and not yet persisted cross-runtime
- Strict fingerprint gating requires a recovery/rebind process before production rollout

## Project Docs

- Agent operating context: [AGENTS.md](AGENTS.md)
- Contribution process: [CONTRIBUTING.md](CONTRIBUTING.md)
- Test and verification guide: [TESTING.md](TESTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Ongoing development log: [DEVLOG.md](DEVLOG.md)
