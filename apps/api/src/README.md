# Source Overview

This folder contains the runtime entry points for the API service.

## server.ts

**Purpose**
- Bootstraps the Express server and defines the initial HTTP routes.

**Why**
- Keeps the API entry point easy to locate and reason about while we scale to
  controllers, routers, and middleware.

**How it works**
- Configures JSON parsing.
- Defines health and room endpoints.
- Starts the HTTP server on `API_PORT`.

**Next steps**
- Extract route modules (rooms, sessions, recordings).
- Add auth middleware and request validation.
- Add persistence via Prisma.
