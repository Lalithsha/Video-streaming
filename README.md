# Video Streaming Platform

This monorepo contains the MediaSoup-based live classroom platform and supporting services.

## Services

- **apps/web**: Next.js UI and NextAuth auth routes.
- **apps/api**: REST API for rooms, classes, and recordings.
- **apps/signaling**: Socket.IO signaling for WebRTC setup.
- **apps/media-worker**: MediaSoup SFU workers.
- **apps/worker**: BullMQ background jobs.

## Packages

- **packages/ui**: shared shadcn/ui components.
- **packages/config**: shared lint/format/TS config.

## Getting started

1. Copy `.env.example` to `.env` and fill in credentials.
2. Install dependencies.
3. Run `npm run dev` from the repo root to start the Turborepo pipeline.
