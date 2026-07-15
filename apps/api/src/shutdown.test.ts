import { test } from "node:test";
import assert from "node:assert";
import { config } from "dotenv";
import { resolve } from "path";

// Load the root .env file (standard for Node.js test runners)
config({ path: resolve(__dirname, "../../../.env") });

// 1. Mock process.exit so the test runner doesn't exit prematurely
const originalExit = process.exit;
let exitCode: number | undefined;

process.exit = (code?: string | number | null | undefined): never => {
  exitCode = typeof code === "number" ? code : 0;
  return undefined as never;
};

// 2. Inject fallback environment variables for test execution
process.env.AUTH_REQUIRED = process.env.AUTH_REQUIRED ?? "false";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test_auth_secret_32_characters_minimum";
process.env.WORKER_PORT = process.env.WORKER_PORT ?? "4003";
process.env.MEDIA_WORKER_PORT = process.env.MEDIA_WORKER_PORT ?? "4002";
process.env.MEDIA_WORKER_URL = process.env.MEDIA_WORKER_URL ?? "http://localhost:4002";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

test("Graceful Shutdown Integration Test", async (t) => {
  const { server, shutdown } = await import("./server");

  // Confirm server is running and wait for it to start listening
  assert.ok(server, "HTTP server instance should be initialized");
  while (!server.listening) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  await t.test("Readiness check before shutdown", async () => {
    const res = await fetch("http://localhost:4000/health/readiness");
    const body = await res.json();
    assert.notStrictEqual(body.error, "Server is shutting down");
  });

  await t.test("Triggers clean shutdown and exits with code 0", async () => {
    const shutdownPromise = shutdown("SIGTERM");
    await shutdownPromise;
    assert.strictEqual(exitCode, 0, "Process should have exited cleanly with code 0");
  });
});

// Restore process.exit after test completes
test.after(() => {
  process.exit = originalExit;
});
