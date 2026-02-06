# Media Worker Service

This service runs MediaSoup workers responsible for SFU media routing.

## Purpose
- Host MediaSoup workers and routers for each live room.
- Manage WebRTC transports, producers, and consumers.
- Provide the media plane for real-time classes.

## Why this service exists

MediaSoup requires separate worker processes to handle RTP/RTCP and SFU logic. Isolating the media plane improves stability and makes scaling explicit.

## Directory map

```
apps/media-worker/
  src/
    index.ts   MediaSoup worker bootstrap
```

## How it works today (bootstrap)

- Creates a MediaSoup worker pool and routers per room.
- Exposes HTTP endpoints to create WebRTC transports, producers, and consumers.
- Logs lifecycle events and exits on worker death.
- Exposes `GET /health` and `GET /stats` to report worker/room counts.

## How it will evolve

- Spin up one worker per CPU core.
- Add explicit teardown + capacity management per room.
- Expose RPC or event APIs for the signaling server.
