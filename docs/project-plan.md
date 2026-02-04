# Creator Studio (Live Classes + Recordings)

This document defines a production-minded plan for building a MediaSoup-based live classroom platform inside a Turborepo. It is written as a living onboarding guide so a new engineer can understand the architecture, data flow, and the rationale behind package choices. It also records initial architectural decisions and the intended upgrade paths when limits are reached.

## 0) Goals, Non-Goals, and Scope

### Goals

- Low-latency live classes (host + speakers + viewers).
- Clear role-based controls (host/co-host/speaker/viewer).
- Reliable recordings and VOD playback.
- Scalable architecture that can evolve to multi-node.

### Non-Goals (for MVP)

- Fully managed transcode pipelines with multiple renditions.
- Complex editing timelines or post-production tooling.
- Enterprise SSO beyond NextAuth providers.

### Scope (MVP)

- Live classroom with chat + Q&A.
- Recording to VOD (single mixed file).
- Role-based UI and moderation.

## 1) Concrete MediaSoup + Turborepo Architecture (Diagram + Notes)

```
┌───────────────────────────────────────────────────────────────────────┐
│                               CLIENTS                                 │
│  Next.js Web App (classroom UI, device controls, chat, Q&A, VOD)        │
└───────────────┬───────────────────────────────────────────────────────┘
                │ HTTPS / WebSocket (signaling) / WebRTC media
┌───────────────▼───────────────────────────────────────────────────────┐
│                             APPS (Turborepo)                           │
│                                                                       │
│  apps/web            → Next.js + shadcn UI + zustand                   │
│  apps/api            → REST/GraphQL (auth, class mgmt, roles, VOD)     │
│  apps/signaling      → Socket.IO signaling for MediaSoup               │
│  apps/media-worker   → MediaSoup SFU workers (per CPU core)            │
│  apps/worker         → BullMQ jobs (recording, upload, transcode)      │
│                                                                       │
│  packages/ui         → shared shadcn components                        │
│  packages/config     → shared lint/tsconfig/eslint/prettier            │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│                              DATA / STATE                              │
│  PostgreSQL (Prisma)       Redis (presence, queues, routing)           │
│  S3-compatible storage     CDN (CloudFront, later)                     │
└───────────────────────────────────────────────────────────────────────┘
```

Key flows:

- **Signaling**: client ↔ apps/signaling (Socket.IO), then client ↔ MediaSoup
- **Media**: WebRTC streams via MediaSoup SFU workers
- **Recording**: MediaSoup → FFmpeg → local file → background upload to S3
- **VOD**: client requests metadata from apps/api → signed URL → CDN

## 1.1) Why These Packages (High-Level Rationale)

- **MediaSoup**: battle-tested SFU with fine control over producers/consumers and scalability.
- **Socket.IO**: reliable signaling with reconnection, acks, rooms, and binary payload support.
- **NextAuth**: quick integration with OAuth/email providers and flexible session strategy.
- **Prisma**: strong TypeScript ORM with migrations and schema visibility.
- **BullMQ**: robust Redis-backed job processing for recording uploads and transcoding.
- **Zustand**: minimal state management ideal for real-time UI and media state.
- **shadcn/ui**: consistent UI primitives with accessibility baked in.

## 2) Step-by-Step Implementation Roadmap

### Phase 0 — Repo & Tooling Foundation

- Initialize Turborepo and base configs.
- Create `packages/config` for lint/tsconfig/eslint/prettier.
- Create `packages/ui` for shadcn components.
- Add shared env management (e.g., dotenv, zod schema).

### Phase 1 — Auth + Core Data Model

- Add Next.js app (apps/web).
- Add API service (apps/api).
- Implement NextAuth with providers and session strategy (JWT or DB sessions).
- Add Prisma schema (Users, Classes, Sessions, Recordings, Roles).

### Phase 2 — Signaling + Basic Media

- Add signaling server (apps/signaling) using Socket.IO.
- Add MediaSoup worker app (apps/media-worker).
- Implement room creation, join, and producer/consumer flows.

### Phase 3 — Classroom UX

- Role-based UI: Host, Co-host, Speaker, Viewer.
- Raise-hand flow + moderation queue.
- Chat + Q&A (persisted and live).

### Phase 4 — Recording & VOD (MVP)

- Add FFmpeg recorder pipeline.
- Store local recordings and upload to S3 via BullMQ.
- Serve VOD playback with metadata.

### Phase 5 — Reliability & Observability

- Add Redis-backed presence tracking.
- Metrics with Prometheus + Grafana.
- Error tracking (Sentry) on client/server.

### Phase 6 — Scale & Improvements

- Introduce multi-node SFU routing.
- Add multi-track recordings, improved transcode pipeline.
- Add CDN, edge caching, and geo-aware routing.

## 3) Recommended Tech Stack (Exact Packages)

### Frontend (apps/web)

- `next`, `react`, `react-dom`
- `next-auth` (auth)
- `zustand` (state)
- `@tanstack/react-query` (server data)
- `shadcn/ui`, `radix-ui` (UI)
- `zod` (validation)

### Signaling (apps/signaling)

- `socket.io`
- `zod` (payload validation)
- `prom-client` (metrics)

### Media Worker (apps/media-worker)

- `mediasoup`
- `mediasoup-client`
- `ffmpeg` (system dependency)
- `fluent-ffmpeg` (optional wrapper)

### API (apps/api)

- `next-auth` (auth server)
- `prisma` (ORM) + `@prisma/client`
- `jsonwebtoken` (if custom tokens)
- `zod` (validation)

### Background Jobs (apps/worker)

- `bullmq` (queues)
- `ioredis` (Redis client)

### Storage & VOD

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- CDN: CloudFront or compatible

### Observability

- `sentry` (frontend/back)
- `prom-client`
- `pino` or `winston` (logging)

## 4) Critical Decisions (MVP Defaults + Upgrade Paths)

### 4.1 Recording Strategy

**MVP default:** Single mixed file (composited).  
**Why:** Fastest to implement, easiest playback.  
**Upgrade path:** Add multi-track recording for post-production, alternate layouts, and highlights generation when editing requirements appear or creator demands increase.

### 4.2 Scaling Model

**MVP default:** Single node + multi-worker (one MediaSoup worker per CPU core).  
**Why:** Simplifies deployment and reliability early.  
**Upgrade path:** Add Redis-based room routing and multi-node SFU cluster once CPU/network saturation or room concurrency thresholds are hit.

### 4.3 Role & Permission Model

**MVP default:** Host, Co-host, Speaker, Viewer.  
**Why:** Covers common classroom roles without complicated ACLs.  
**Upgrade path:** Add granular permissions (per action) and custom roles once moderation and enterprise requirements grow.

### 4.4 Storage + VOD Pipeline

**MVP default:** Record locally → upload to S3 with BullMQ → serve via signed URLs.  
**Why:** Stable, minimal moving parts, easy to debug.  
**Upgrade path:** Stream uploads during recording and add multi-rendition transcoding + CDN edge caching when storage size, playback volume, or latency become bottlenecks.

## 5) Improvement Triggers (When to Upgrade)

- **Recording:** If creators want editing, multiple layouts, or highlight reels → move to multi-track.
- **Scaling:** If CPU > 70% sustained or rooms > 30 concurrent → move to multi-node.
- **Roles:** If teams request more governance or compliance → add granular ACLs.
- **VOD:** If playback latency or buffering issues arise → add transcoding + CDN.

## 6) Detailed System Design (How Logic Flows)

### 6.1) Authentication (NextAuth)

- **Why**: NextAuth provides OAuth/email providers, secure cookies, and session handling with minimal boilerplate.
- **Flow**:
  1. User signs in via provider.
  2. API issues session (JWT or DB).
  3. Client uses session to fetch class data and join rooms.
- **Notes**: For production, prefer database sessions for revocation and auditability.

### 6.2) Signaling (Socket.IO)

- **Why**: WebRTC requires out-of-band signaling; Socket.IO provides reconnection, room semantics, and acked events.
- **Flow**:
  1. Client connects to `apps/signaling` using auth token.
  2. Server creates/joins a room and returns MediaSoup RTP capabilities.
  3. Client creates transports and negotiates producers/consumers.
  4. Server coordinates with `apps/media-worker` for transport/producer creation.

### 6.3) Media (MediaSoup SFU)

- **Why**: MediaSoup provides selective forwarding with control over bandwidth and QoS.
- **Flow**:
  1. Media worker creates router per room.
  2. Clients create WebRTC transports and start producing audio/video.
  3. Server creates consumers for each viewer.
  4. Server adjusts layers (simulcast) based on client bandwidth.

### 6.4) Recording Pipeline

- **Why**: Recording is best handled asynchronously to avoid blocking real-time flows.
- **Flow**:
  1. Media worker pipes streams to FFmpeg.
  2. Local file saved on media node.
  3. BullMQ job uploads to S3 and updates DB.
  4. VOD served with signed URL and optional CDN.

### 6.5) Data Model (Prisma)

Core entities:

- **User**: identity and role.
- **Class**: metadata and schedule.
- **Session**: live occurrence of a class.
- **Recording**: file location and status.
- **Participant**: role + attendance.

### 6.6) Real-Time State (Redis + Zustand)

- **Redis**: presence, room membership, and job queues.
- **Zustand**: client-side state for device selection, mute, hand raise, and connection quality.

## 7) Repository Structure (Turborepo)

```
apps/
  web/             Next.js client (UI, auth, classroom)
  api/             API (class mgmt, roles, VOD metadata)
  signaling/       Socket.IO signaling server
  media-worker/    MediaSoup SFU workers
  worker/          BullMQ jobs (recording, upload)
packages/
  ui/              shared shadcn UI components
  config/          shared lint/tsconfig/eslint/prettier
```

## 8) Operational Concerns (Production Checklist)

- **Observability**: Prometheus metrics + Sentry error tracking.
- **Scaling**: one MediaSoup worker per CPU core; add multi-node routing later.
- **Security**: JWT/Session validation on signaling, rate limits, TURN servers.
- **Reliability**: health checks for media workers, restart strategies.
- **Cost**: S3 storage and bandwidth, CPU-heavy SFU nodes.

## 9) Future Improvements (Planned)

- Multi-track recordings and post-production workflows.
- Geo-distributed SFU clusters.
- Advanced moderation (recorded audit trails).
- Adaptive bitrate and simulcast tuning.

## 10) Implementation Status (Bootstrap)

Initial scaffolding is in place to start development:

- Turborepo workspace and base TypeScript config.
- Next.js app (apps/web) with NextAuth auth route.
- Socket.IO signaling server (apps/signaling).
- MediaSoup worker entry point (apps/media-worker).
- BullMQ worker skeleton (apps/worker).
- Express API placeholder (apps/api).

## 11) Local Development Notes

- Copy `.env.example` to `.env` and fill in provider credentials.
- Start services with `pnpm dev` or `npm run dev` at repo root once dependencies are installed.
- API health endpoint is available at `/health`.
