# Signaling Service

This service handles Socket.IO signaling for WebRTC setup and room presence.

## Purpose
- Coordinate room joins/leaves and peer discovery.
- Broker signaling messages between web clients and the MediaSoup worker layer.
- Maintain lightweight room presence until Redis-backed tracking is added.

## Why this service exists

WebRTC requires an out-of-band channel to exchange metadata (room membership, RTP capabilities, transport IDs). Socket.IO gives us reconnection, rooms, and ack semantics out of the box.

## Directory map

```
apps/signaling/
  src/
    server.ts   Socket.IO server bootstrap and room events
```

## How it works today (bootstrap)

- Accepts Socket.IO connections with CORS configured for `WEB_ORIGIN`.
- Supports optional NextAuth JWT validation when `AUTH_REQUIRED=true`.
- When auth is enabled, ensure `WEB_ORIGIN` matches the Next.js origin so credentialed cookies can be sent.
- Supports `room:join` and `room:leave`.
- Brokers MediaSoup transport, produce, and consume events to the media-worker.
- Emits `room:peers`, `room:peer-joined`, and `room:peer-left`, plus producer add/remove events.
- Exposes `GET /health` and `GET /stats` on the same HTTP server for monitoring.

## How it will evolve

- Persist presence in Redis for multi-node scaling.
- Add MediaSoup router/transport negotiation flows.
