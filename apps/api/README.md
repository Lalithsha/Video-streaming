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

- `server.ts` starts an Express server backed by Prisma.
- Endpoints:
  - `GET /health` → readiness check.
  - `POST /rooms` → create a room in the database.
  - `GET /rooms/:roomId` → fetch a room from the database.
  - `POST /rooms/:roomId/sessions` → create a session for a room.
  - `PATCH /sessions/:sessionId` → update session status.
  - Recording + participant endpoints are backed by persisted tables.

## Auth and persistence

- Requires `DATABASE_URL` for Prisma.
- Set `AUTH_REQUIRED=true` and `NEXTAUTH_SECRET` to enforce NextAuth JWT validation.
- When auth is enabled, room/session/recording mutations require a valid token.
- Ensure `WEB_ORIGIN` matches the Next.js origin so credentialed cookies are accepted.

## How it will evolve

- Add validation (Zod) for request payloads.
- Introduce pagination, role checks, and audit logging.
