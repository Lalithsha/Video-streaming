# Source Overview

## app/

**Purpose**
- Houses App Router pages and API routes.

**Why**
- Keeps UI, auth, and client logic colocated with Next.js route structure.

**How it works**
- `layout.tsx` defines the root layout and wraps the session provider.
- `page.tsx` renders the bootstrap room UI.
- `api/auth/[...nextauth]/route.ts` handles auth callbacks.

**Next steps**
- Add feature routes (rooms, schedule, recordings).
- Add shared components and hooks.
