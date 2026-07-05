# Contributing to ChatPose

Welcome. This project follows a security-first, maintainable implementation style.

Read these files in order:

1. [README.md](README.md)
2. [AGENTS.md](AGENTS.md)
3. [DEVLOG.md](DEVLOG.md)
4. [TESTING.md](TESTING.md)
5. [SECURITY.md](SECURITY.md)

## Non-Negotiables

- Never log secrets, decrypted payloads, or raw host traits.
- Never persist plaintext messages or plaintext file chunks.
- Preserve strict one-session-two-peers invariant.
- Keep changes focused; avoid unrelated refactors.
- Keep docs and tests in sync with behavior changes.

## Branch Naming

- feature/<short-description>
- fix/<short-description>
- refactor/<short-description>
- docs/<short-description>
- chore/<short-description>

Use lowercase with hyphens.

## Commit Messages

Use imperative, concise subject lines.

Examples:

- feat: add replay-token persistence seam
- fix: reject outbound message on binding mismatch
- docs: align testing guide with new sendfile command

## Pull Request Workflow

1. Branch from latest main.
2. Implement focused change set.
3. Run local verification.
4. Update docs and DEVLOG entries.
5. Open PR with summary and security notes.

## Local Verification

Run before opening or updating a PR:

- npm run lint
- npm run typecheck
- npm test
- npm run build
- npm run security:audit

## PR Checklist

- [ ] Scope is focused and documented.
- [ ] Security-sensitive paths reviewed.
- [ ] No plaintext sensitive data introduced.
- [ ] Tests added or updated for changed behavior.
- [ ] README and TESTING updated if command or setup changed.
- [ ] DEVLOG updated with summary and follow-ups.

## Adding New Commands or Tools

1. Add command routing and validation in [src/app/application.ts](src/app/application.ts).
2. Add domain/infrastructure behavior in corresponding module.
3. Add tests in [tests](tests).
4. Update command docs in [README.md](README.md).
5. Update verification notes in [TESTING.md](TESTING.md).
