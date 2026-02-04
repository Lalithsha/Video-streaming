import { Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

const recordingWorker = new Worker(
  "recordings",
  async (job) => {
    console.log("Processing recording job", job.id, job.data);
  },
  { connection }
);

recordingWorker.on("failed", (job, error) => {
  console.error("Recording job failed", job?.id, error);
});
