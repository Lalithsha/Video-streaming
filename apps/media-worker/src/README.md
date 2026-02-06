# Source Overview

## index.ts

**Purpose**
- Starts MediaSoup workers and listens for lifecycle events.

**Why**
- Acts as the foundation for room routers and transport management.

**How it works**
- Calls `mediasoup.createWorker()`.
- Exits the process if the worker dies.

**Next steps**
- Accept configuration for worker count and RTC ports.
- Initialize routers for each active room.
