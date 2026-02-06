# Source Overview

## server.ts

**Purpose**
- Bootstraps the Socket.IO server and defines room event handlers.

**Why**
- Keeps signaling logic centralized so MediaSoup negotiation can build on a single event flow.

**How it works**
- Creates an HTTP server.
- Attaches Socket.IO with CORS settings.
- Tracks room participants in-memory and emits join/leave events.

**Next steps**
- Add auth middleware for Socket.IO.
- Store presence in Redis.
- Add MediaSoup negotiation events (transports, producers, consumers).
