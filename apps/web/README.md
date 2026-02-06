# Web App

The Next.js application that provides the classroom UI and authentication entry point.

## Purpose
- Render the live classroom UI (rooms, peers, controls).
- Provide NextAuth authentication routes and session handling.
- Host the client-side signaling and MediaSoup client logic.

## Why this app exists

The web client is the primary user experience. It owns device access, UI state, and connection flows to the API and signaling services.

## Directory map

```
apps/web/
  src/app/             Next.js App Router pages and API routes
  src/app/api/auth/    NextAuth route handlers
```

## How it works today (bootstrap)

- `page.tsx` provides room creation/join and peer list UI.
- `providers.tsx` wires the NextAuth session provider.
- `signin/page.tsx` provides a simple sign-in UI.
- API and signaling calls include credentials so NextAuth JWT cookies can be validated by backend services.
- MediaSoup client flows create send/receive transports and display local/remote media streams.

## How it will evolve

- Add classroom UI (chat, Q&A, stage controls).
- Add MediaSoup client logic and device management.
- Replace inline styles with shared shadcn/ui components.
