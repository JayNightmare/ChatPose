# Development Log

The control file. Update this at the end of each session.

## Active Task

2026-07-05: Documentation and agent-template normalization based on corporate markdown structure.

Scope:

- align README/AGENTS/CONTRIBUTING/TESTING/DEVLOG format
- mirror richer .claude and .codex template layout
- keep ChatPose architecture/security details current

## History

### 2026-07-05 - Implementation slice 1

- Summary: Initial secure terminal app scaffold completed.
- Changes:
  - TypeScript toolchain and quality config added.
  - Terminal three-screen workflow implemented.
  - Fingerprint, crypto envelope, libp2p, and SQL modules scaffolded.
  - Governance documentation and base agent guides added.
- Security notes:
  - Strict fingerprint gate enabled.
  - SQL writes are encrypted payload-oriented.
  - Replay token included in message envelope.
- Testing run:
  - Initial typecheck/lint/test pass.
- Follow-ups:
  - Implement runtime session guard and encrypted file chunk flow.

### 2026-07-05 - Implementation slice 2

- Summary: Runtime session policy and encrypted file chunks implemented.
- Changes:
  - Added SessionGuard for strict 1:1 session binding and replay-token tracking.
  - Added disconnect and sendfile commands in CLI workflow.
  - Added encrypted file chunk envelope helpers in crypto service.
  - Added SQL session participant upsert and participant mismatch guards.
  - Added unit tests for replay defense and file chunk crypto roundtrip.
- Security notes:
  - Replay token uniqueness enforced at runtime for outbound payloads.
  - Session participant mismatch rejected before persistence.
- Testing run:
  - Typecheck, lint, and tests passed.
- Follow-ups:
  - Wire encrypted envelopes over active libp2p protocol streams.
  - Persist replay token index in SQL to enforce cross-runtime replay detection.

## Roadmap

- Implement on-wire encrypted message transport over libp2p streams.
- Add encrypted file transfer protocol with peer acknowledgments.
- Add fingerprint recovery/rebind flow for legitimate device drift.
- Add SQL-backed replay index and integration tests.
- Add CI workflow for lint/typecheck/test/security audit.

## Open Decisions

- Recovery model for strict fingerprint drift:
  - Option A: one-time recovery code
  - Option B: admin-approved rebind
  - Option C: signed secondary device trust chain
- Session key strategy evolution:
  - Keep current per-session key only
  - Move to identity key + ephemeral ratchet
