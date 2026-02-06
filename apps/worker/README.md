# Background Worker Service

This service processes asynchronous jobs such as recording uploads and transcoding.

## Purpose
- Offload heavy or delayed work from the API and signaling layer.
- Ensure recording and storage tasks can retry independently.

## Why this service exists

Real-time services must stay responsive. BullMQ + Redis provides reliable job processing with retries and visibility into failures.

## Directory map

```
apps/worker/
  src/
    index.ts   BullMQ worker bootstrap
```

## How it works today (bootstrap)

- Creates a BullMQ worker for the `recordings` queue.
- Logs job processing and failures.
- Exposes `GET /health` and `GET /stats` for queue monitoring.

## How it will evolve

- Add queues for uploads, transcodes, and cleanup.
- Add metrics and structured logging.
- Integrate with S3 and FFmpeg.
