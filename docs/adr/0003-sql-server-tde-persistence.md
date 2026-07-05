# ADR 0003: SQL Server with TDE

## Status

Accepted

## Context

Project requires encrypted storage and compatibility with managed SQL infrastructure.

## Decision

Use SQL Server-compatible schema and mandate TDE at database level for data-at-rest encryption.

## Consequences

- Infrastructure must include key and certificate lifecycle procedures.
- Application still must encrypt payloads before persistence.
- Operational runbooks must include TDE validation in deployment checks.
