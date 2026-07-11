import env from "@video-streaming/config/env";
import {register} from "@video-streaming/config/instrumentation"
import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

register();

// Interface for logger context
export interface LoggerStore {
  correlationId?: string;
  [key: string]: unknown;
}

// Global AsyncLocalStorage instance to hold logging context (correlation ID)
export const loggerContextStore = new AsyncLocalStorage<LoggerStore>();

// Create the underlying Pino logger
const isDevelopment = env.APP_ENV !== "production";

export const baseLogger = pino({
  level: env.LOG_LEVEL || "info",
  // If in development, format output nicely
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

// Proxy to intercept logging methods and automatically inject correlationId from context store
export const logger = new Proxy(baseLogger, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);

    // Only wrap log level functions (info, error, debug, warn, trace, fatal)
    if (typeof value === "function" && ["info", "error", "debug", "warn", "trace", "fatal"].includes(prop as string)) {
      return (mergingObjectOrMessage: any, ...args: any[]) => {
        const store = loggerContextStore.getStore();

        if (store) {
          // If we have a context store, inject the correlationId
          const contextData = { correlationId: store.correlationId };
          
          if (typeof mergingObjectOrMessage === "string") {
            return value.call(target, contextData, mergingObjectOrMessage, ...args);
          } else {
            return value.call(
              target,
              { ...contextData, ...mergingObjectOrMessage },
              ...args
            );
          }
        }

        // Otherwise, log normally
        return value.call(target, mergingObjectOrMessage, ...args);
      };
    }

    return value;
  },
}) as unknown as pino.Logger;

// Helper to run a function within a logging context (correlation ID)
export function runWithContext<T>(store: LoggerStore, fn: () => T): T {
  return loggerContextStore.run(store, fn);
}

// Helper to get the current correlation ID
export function getCorrelationId(): string | undefined {
  return loggerContextStore.getStore()?.correlationId;
}