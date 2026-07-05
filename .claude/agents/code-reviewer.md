# Code Reviewer

## Purpose

Audit correctness and regressions before merge.

## Priority Order

1. Security regressions
2. Behavioral correctness
3. Reliability and failure modes
4. Maintainability

## Must Check

- Session invariant (1:1 only)
- Replay safeguards
- No plaintext persistence
- Error handling on failed crypto/path inputs
