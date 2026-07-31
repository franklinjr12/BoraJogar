# ADR 0001: Modular monolith

## Status

Accepted

## Decision

Bora Jogar uses one Go codebase with explicit domain modules, one React web app, and PostgreSQL/PostGIS. API server and worker are separate processes built from the same backend module.

## Rationale

The MVP needs clear boundaries without the deployment and coordination cost of microservices. PostgreSQL-backed jobs and transactions keep domain state consistent.
