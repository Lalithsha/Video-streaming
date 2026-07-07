import { z } from "zod";

export enum SessionStatus {
  SCHEDULED = "SCHEDULED",
  LIVE = "LIVE",
  ENDED = "ENDED",
}

export enum RecordingStatus {
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
}

export enum ParticipantRole {
  HOST = "HOST",
  COHOST = "COHOST",
  SPEAKER = "SPEAKER",
  VIEWER = "VIEWER",
}

export const SessionStatusSchema = z.enum(SessionStatus);
export const RecordingStatusSchema = z.enum(RecordingStatus);
export const ParticipantRoleSchema = z.enum(ParticipantRole);

// Interfaces for circular dependencies
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  rooms?: Room[];
  participants?: Participant[];
}

export interface Room {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  hostId: string | null;
  host?: User | null;
  sessions?: Session[];
  participants?: Participant[];
}

export interface Session {
  id: string;
  roomId: string;
  status: SessionStatus;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  room?: Room;
  recordings?: Recording[];
}

export interface Recording {
  id: string;
  sessionId: string;
  status: RecordingStatus;
  createdAt: Date;
  url: string | null;
  durationSeconds: number | null;
  session?: Session;
}

export interface Participant {
  id: string;
  roomId: string;
  userId: string | null;
  name: string;
  role: ParticipantRole;
  joinedAt: Date;
  room?: Room;
  user?: User | null;
}

// Zod Schemas using z.lazy to handle recursion
export const UserSchema: z.ZodType<User> = z.lazy(() => z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  createdAt: z.date(),
  rooms: z.array(RoomSchema).optional(),
  participants: z.array(ParticipantSchema).optional(),
}));

export const RoomSchema: z.ZodType<Room> = z.lazy(() => z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  hostId: z.string().nullable(),
  host: UserSchema.nullable().optional(),
  sessions: z.array(SessionSchema).optional(),
  participants: z.array(ParticipantSchema).optional(),
}));

export const SessionSchema: z.ZodType<Session> = z.lazy(() => z.object({
  id: z.string(),
  roomId: z.string(),
  status: SessionStatusSchema,
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  endedAt: z.date().nullable(),
  room: RoomSchema.optional(),
  recordings: z.array(RecordingSchema).optional(),
}));

export const RecordingSchema: z.ZodType<Recording> = z.lazy(() => z.object({
  id: z.string(),
  sessionId: z.string(),
  status: RecordingStatusSchema,
  createdAt: z.date(),
  url: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  session: SessionSchema.optional(),
}));

export const ParticipantSchema: z.ZodType<Participant> = z.lazy(() => z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  role: ParticipantRoleSchema,
  joinedAt: z.date(),
  room: RoomSchema.optional(),
  user: UserSchema.nullable().optional(),
}));

// Export other domains
export * from "./auth.js";
export * from "./room.js";
export * from "./media.js";
export * from "./signaling-events.js";
