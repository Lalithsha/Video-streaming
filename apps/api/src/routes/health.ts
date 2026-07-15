import env from "@video-streaming/config/env";
import { Request, Response, Router } from "express";
import { PrismaClient } from "../generated/prisma";
import Redis from "ioredis";

export default function createHealthRouter(prisma: PrismaClient, isShuttingDownGetter?: () => boolean): Router {
  const router = Router();
  const redis = new Redis(env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    retryStrategy() {
      return null; // Stop retrying immediately
    }
  });
  redis.on("error", () => {});

  router.get("/liveness", (req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  router.get("/readiness", async (req: Request, res: Response) => {
    if (isShuttingDownGetter && isShuttingDownGetter()) {
      res.status(503).json({
        status: "unhealthy",
        error: "Server is shutting down"
      });
      return;
    }

    try {
      const dbPing = prisma.$queryRaw`SELECT 1`;
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Postgres query timeout")), 2000);
      });
      await Promise.race([dbPing, timeout]);

      await redis.ping();

      res.status(200).json({ status: "ready" });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
} 