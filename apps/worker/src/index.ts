import { QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

const recordQueueName = "recordings";
const uploadQueueName = "uploads";

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

process.on("SIGINT", async () => {
  await recordWorker.close();
  await uploadWorker.close();
  await recordEvents.close();
  await uploadEvents.close();
  await connection.quit();
  process.exit(0);
});
