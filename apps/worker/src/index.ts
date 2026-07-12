import env from "@video-streaming/config/env";
import {register} from "@video-streaming/config/instrumentation"
import { logger, runWithContext } from "@video-streaming/logger";
import http from "http";
import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

register()

const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379");
const port = Number(env.WORKER_PORT ?? "4003");
const startedAt = new Date();

const recordQueueName = "recordings";
const uploadQueueName = "uploads";

const recordQueue = new Queue(recordQueueName, { connection });
const uploadQueue = new Queue(uploadQueueName, { connection });

const recordWorker = new Worker(
  recordQueueName,
  async (job) => {
    const correlationId = job.data?.correlationId;
    return runWithContext({ correlationId }, async () => {
      logger.info({ jobId: job.id, jobName: job.name }, "Processing recording job");
      if (job.name === "finalize-recording") {
        return {
          recordingId: job.data.recordingId,
          status: "ready",
          completedAt: new Date().toISOString()
        };
      }
      return { ok: true };
    });
  },
  { connection, concurrency: 4 }
);

const uploadWorker = new Worker(
  uploadQueueName,
  async (job) => {
    const correlationId = job.data?.correlationId;
    return runWithContext({ correlationId }, async () => {
      logger.info({ jobId: job.id, jobName: job.name }, "Processing upload job");
      if (job.name === "upload-recording") {
        const storageUrl = `s3://example-bucket/${job.data?.recordingId ?? "unknown"}`;
        return { url: storageUrl, uploadedAt: new Date().toISOString() };
      }
      return { ok: true };
    });
  },
  { connection, concurrency: 2 }
);

const recordEvents = new QueueEvents(recordQueueName, { connection });
const uploadEvents = new QueueEvents(uploadQueueName, { connection });

const jsonResponse = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health/liveness") {
    jsonResponse(res, 200, {
      status: "ok",
      redisStatus: connection.status,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000)
    });
    return;
  }

  if(req.method==="GET" && url.pathname==="/health/readiness"){
    try {
      // Ping the existing redis connection

      await connection.ping();
      jsonResponse(res, 200, {status: "ready"})

    } catch (error) {
      jsonResponse(res, 503, {
        status:"unhealthy",
        error: error instanceof Error ? error.message : "Redis connection down"
      })
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats") {
    const [recordCounts, uploadCounts] = await Promise.all([
      recordQueue.getJobCounts(),
      uploadQueue.getJobCounts()
    ]);
    jsonResponse(res, 200, {
      queues: {
        recordings: recordCounts,
        uploads: uploadCounts
      },
      redisStatus: connection.status,
      startedAt: startedAt.toISOString()
    });
    return;
  }
  jsonResponse(res, 404, { error: "Not found" });
});

recordWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error }, "Recording job failed");
});

uploadWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error }, "Upload job failed");
});

recordEvents.on("completed", ({ jobId, returnvalue }) => {
  logger.info({ jobId, returnvalue }, "Recording job completed");
});

uploadEvents.on("completed", ({ jobId, returnvalue }) => {
  logger.info({ jobId, returnvalue }, "Upload job completed");
});

const shutdown = async () => {
  await recordWorker.close();
  await uploadWorker.close();
  await recordEvents.close();
  await uploadEvents.close();
  await recordQueue.close();
  await uploadQueue.close();
  await connection.quit();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, () => {
  logger.info(`Worker service running on :${port}`);
});
