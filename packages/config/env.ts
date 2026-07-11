// src/config/env.ts
import z from 'zod';

export enum AppEnv {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}

// Define the schema for the environment variables
const envSchema = z.object({
  APP_ENV: z.enum([AppEnv.Development, AppEnv.Staging, AppEnv.Production], {
    message: 'Invalid environment' as const,
  }).default(AppEnv.Development),
  WEB_ORIGIN: z.url(),
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_SIGNALING_URL: z.url(),
  API_PORT: z.coerce.number().min(1024).max(65535),
  SIGNALING_PORT: z.coerce.number().min(1024).max(65535),
  REDIS_URL: z.url(),
  GITHUB_ID: z.string(),
  GITHUB_SECRET: z.string(),
  DATABASE_URL: z.string(),
  AUTH_REQUIRED: z.string(),
  NEXTAUTH_SECRET: z.string(),
  WORKER_PORT: z.coerce.number(),
  MEDIA_WORKER_PORT: z.coerce.number(),
  MEDIASOUP_WORKERS: z.string().optional(),
  MEDIA_WORKER_URL: z.url(),
  LOG_LEVEL: z.string()
});

// Function to validate the environment variables
 const result = envSchema.safeParse(process.env);

// // Extend ProcessEnv interface with environment variables schema
// declare global {
//   namespace NodeJS {
//     interface ProcessEnv {
//       WEB_ORIGIN?: string;
//       NEXT_PUBLIC_API_URL?: string;
//       NEXT_PUBLIC_SIGNALING_URL?: string;
//       API_PORT?: string;
//       SIGNALING_PORT?: string;
//       REDIS_URL?: string;
//       GITHUB_ID?: string;
//       GITHUB_SECRET?: string;
//     }
//   }
// }

// 2. Export the check for instrumentation.ts to use at startup
export const validateEnv = () => result;

export const env = result.success ? result.data : (process.env as any);

export default env;
