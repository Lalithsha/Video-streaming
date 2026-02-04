# API Service

This service owns the HTTP API for room and class lifecycle. It is intentionally small in the bootstrap phase, but the patterns here match the production target (auth, validation, and durable storage).

## Purpose

- Provide REST endpoints used by the web client and signaling layer.
- Centralize business rules for classes, sessions, and recordings.
- Act as the integration point for authentication and persistence (NextAuth + Prisma).

## Why this service exists

The API is the canonical entry point for state changes (create room, fetch metadata, update session status). Keeping these rules in one place prevents duplicated logic across the UI and signaling server.

## Directory map

```
apps/api/
  src/
    server.ts   Express bootstrap + route definitions
```

## How it works today (bootstrap)

- `server.ts` starts an Express server.
- Endpoints:
  - `GET /health` → readiness check.
  - `POST /rooms` → create an in-memory room.
  - `GET /rooms/:roomId` → fetch an in-memory room.

## How it will evolve

- Replace in-memory `rooms` map with Prisma models.
- Add auth middleware (NextAuth session validation).
- Add validation (Zod) for request payloads.
- Introduce pagination, role checks, and audit logging.
