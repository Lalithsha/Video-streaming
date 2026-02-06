# Source Overview

## index.ts

**Purpose**
- Bootstraps BullMQ workers for background tasks.

**Why**
- Keeps long-running operations out of request/response paths.

**How it works**
- Connects to Redis.
- Registers a worker for the `recordings` queue.

**Next steps**
- Add job handlers for upload/transcode flows.
- Add structured logging and monitoring.
