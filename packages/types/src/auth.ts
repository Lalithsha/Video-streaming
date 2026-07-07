import { z } from "zod";

export const AuthContextSchema = z.object({
  userId: z.string(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
});
export type AuthContext = z.infer<typeof AuthContextSchema>;

export const SocketAuthSchema = z.object({
  userId: z.string(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
});
export type SocketAuth = z.infer<typeof SocketAuthSchema>;

export const JWTPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  picture: z.string().nullable().optional(),
});
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
