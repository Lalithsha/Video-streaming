import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { runWithContext } from "@video-streaming/logger";

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers["x-correlation-id"] as string) || randomUUID();
  
  // Set response header so clients can trace it too
  res.setHeader("x-correlation-id", correlationId);

  // Store in request object in case it is needed locally
  (req as any).correlationId = correlationId;

  // Run the rest of the request lifecycle in the AsyncLocalStorage context
  runWithContext({ correlationId }, () => {
    next();
  });
};
