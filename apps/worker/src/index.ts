import http from "http";
import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
const port = Number(process.env.WORKER_PORT ?? "4003");
const startedAt = new Date();

const recordQueueName = "recordings";
const uploadQueueName = "uploads";

const recordQueue = new Queue(recordQueueName, { connection });
const uploadQueue = new Queue(uploadQueueName, { connection });

const recordWorker = new Worker(
  recordQueueName,
  async (job) => {
    console.log("Processing recording job", job.id, job.name, job.data);
    if (job.name === "finalize-recording") {
      return {
        recordingId: job.data.recordingId,
        status: "ready",
        completedAt: new Date().toISOString()
      };
    }
    return { ok: true };
  },
  { connection, concurrency: 4 }
);

const uploadWorker = new Worker(
  uploadQueueName,
  async (job) => {
    console.log("Processing upload job", job.id, job.name, job.data);
    if (job.name === "upload-recording") {
      const storageUrl = `s3://example-bucket/${job.data?.recordingId ?? "unknown"}`;
      return { url: storageUrl, uploadedAt: new Date().toISOString() };
    }
    return { ok: true };
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
  if (req.method === "GET" && url.pathname === "/health") {
    jsonResponse(res, 200, {
      status: "ok",
      redisStatus: connection.status,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000)
    });
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
  console.error("Recording job failed", job?.id, error);
});

uploadWorker.on("failed", (job, error) => {
  console.error("Upload job failed", job?.id, error);
});

recordEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log("Recording job completed", jobId, returnvalue);
});

uploadEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log("Upload job completed", jobId, returnvalue);
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
  console.log(`Worker service running on :${port}`);
});
