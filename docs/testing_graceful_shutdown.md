# Testing Graceful Shutdown — Guide & Verification Plan

This guide outlines how to verify and test the **Phase 0.5 (Graceful Shutdown)** implementation across our services.

---

## 🧪 Test Case 1: Manual Signal Termination (Local CLI)
The simplest way to verify signal handling is to run the service locally, retrieve its Process ID (PID), send a SIGTERM signal, and inspect the logs.

### Steps:
1. Start the API service:
   ```bash
   cd apps/api
   bun run src/server.ts
   ```
2. In a separate terminal tab, find the Process ID (PID) listening on port 4000:
   ```bash
   lsof -i :4000
   ```
   *(Note the PID from the output, e.g., `12345`)*
3. Send the termination signal (`SIGTERM` is signal 15):
   ```bash
   kill -15 <PID>
   ```
4. Observe the terminal output of the API server. You should see logs indicating:
   * `[INFO] Received SIGTERM, starting graceful shutdown...`
   * `[INFO] HTTP Server closed`
   * `[INFO] Database client disconnected`
   * The process exits cleanly with status code `0`.

---

## 🧪 Test Case 2: Connection Draining Verification (Active Requests)
To verify that the server does not abruptly disconnect active/in-flight requests when a shutdown is initiated:

### Steps:
1. Temporarily add a slow test endpoint to `apps/api/src/server.ts`:
   ```typescript
   app.get("/slow-test", async (req, res) => {
     setTimeout(() => {
       res.json({ message: "Completed after delay" });
     }, 5000); // 5 second delay
   });
   ```
2. Start the API server.
3. Trigger the slow request in a browser or via `curl`:
   ```bash
   curl http://localhost:4000/slow-test
   ```
4. While the request is still pending (during the 5-second sleep), find the PID and send a `SIGTERM` signal:
   ```bash
   kill -15 <PID>
   ```
5. **Verify the results**:
   * The server should log the shutdown signal, but the process **must not exit immediately**.
   * The `curl` request must finish successfully and receive the JSON response `{ "message": "Completed after delay" }`.
   * Only *after* the request completes, the server should log `HTTP Server closed` and exit cleanly.

---

## 🧪 Test Case 3: Health Probe Transition (Readiness Probe 503)
When a server begins shutting down, the load balancer needs to know immediately so it stops routing *new* traffic to it, while the server finishes processing *existing* requests.

### Steps:
1. Refactor `/health/readiness` to check the `isShuttingDown` flag and return `503 Service Unavailable` if it is true.
2. Boot the server and hit `http://localhost:4000/health/readiness` (returns `200 ready`).
3. Send a `SIGTERM` signal.
4. Hit the readiness probe again during the shutdown window—it should immediately return `503 unhealthy`, signaling it is no longer ready for new traffic.
