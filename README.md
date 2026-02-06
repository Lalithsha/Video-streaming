# Video Streaming Platform

This monorepo contains the MediaSoup-based live classroom platform and supporting services.

## Services overview

| Service | Path | What it owns |
| --- | --- | --- |
| Web client | `apps/web` | Next.js UI, NextAuth auth routes, and the Creator Studio front-end experience. |
| API | `apps/api` | REST endpoints for rooms, sessions, recordings, participants, and system health. |
| Signaling | `apps/signaling` | Socket.IO signaling, presence, chat events, and MediaSoup capability discovery. |
| Media worker | `apps/media-worker` | MediaSoup SFU workers, routers per room, and RTP capability exposure. |
| Background worker | `apps/worker` | BullMQ processing for recordings/uploads and async jobs. |

## Packages

- **packages/ui**: shared shadcn/ui components.
- **packages/config**: shared lint/format/TS config.

## Quick start

1. Copy `.env.example` to `.env` and fill in credentials.
2. Install dependencies.
3. Run `npm run dev` from the repo root to start the Turborepo pipeline.

## Service responsibilities (detail)

### apps/web
- Creator Studio UI and landing experience.
- NextAuth-powered auth routes.
- Client-side room workflow (create/join, live status, participant roster).

### apps/api
- `GET /health` and `GET /stats` system endpoints.
- Room lifecycle (`/rooms`, `/rooms/:roomId`).
- Session lifecycle (`/rooms/:roomId/sessions`, `/sessions/:sessionId`).
- Recording metadata (`/sessions/:sessionId/recordings`, `/recordings/:recordingId`).
- Participants (`/rooms/:roomId/participants`).

### apps/signaling
- Socket.IO events: `room:join`, `room:leave`, `room:peer-joined`, `room:peer-left`.
- Room roster and hand-raise events.
- Optional MediaSoup RTP capability discovery for joining clients.

### apps/media-worker
- MediaSoup worker pool (one per CPU by default).
- Room router creation and RTP capability exposure.
- HTTP control surface for room lifecycle (`POST /rooms`, `GET /rooms/:roomId`).

### apps/worker
- BullMQ queues for recordings and uploads.
- Async job handlers with completion/failure logging.
