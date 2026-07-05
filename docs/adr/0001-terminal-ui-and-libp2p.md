# ADR 0001: Terminal UI and libp2p Baseline

## Status

Accepted

## Context

Project requires a terminal-like user experience and direct peer communication for chat sessions.

## Decision

Use Node.js + TypeScript + Blessed for terminal UX and libp2p as the P2P communication foundation.

## Consequences

- Fast CLI delivery with strong control over UX.
- Requires explicit handling of NAT traversal and peer session lifecycle.
- Keeps browser tracking surface out of scope by architecture.
