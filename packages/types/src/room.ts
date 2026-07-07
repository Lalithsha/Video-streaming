import { z } from "zod";
import { RoomSchema } from "./index.js";

// 1. Join Room
export const JoinRoomRequestSchema = z.object({
  roomId: z.string(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  userImage: z.string().nullable(),
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const JoinRoomResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;

// 2. Create Room
export const CreateRoomRequestSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  hostEmail: z.string().nullable(),
  hostImage: z.string().nullable(),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const CreateRoomResponseSchema = z.object({
  roomId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  hostEmail: z.string().nullable(),
  hostImage: z.string().nullable(),
});
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

// 3. Leave Room
export const LeaveRoomRequestSchema = z.object({
  roomId: z.string(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  userImage: z.string().nullable(),
});
export type LeaveRoomRequest = z.infer<typeof LeaveRoomRequestSchema>;

export const LeaveRoomResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().nullable(),
});
export type LeaveRoomResponse = z.infer<typeof LeaveRoomResponseSchema>;

// 4. Get Room
export const GetRoomRequestSchema = z.object({
  roomId: z.string(),
});
export type GetRoomRequest = z.infer<typeof GetRoomRequestSchema>;

export const GetRoomResponseSchema = z.object({
  roomId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  hostEmail: z.string().nullable(),
  hostImage: z.string().nullable(),
});
export type GetRoomResponse = z.infer<typeof GetRoomResponseSchema>;

// 5. Get Rooms (plural)
export const GetRoomsRequestSchema = z.object({
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  userImage: z.string().nullable(),
});
export type GetRoomsRequest = z.infer<typeof GetRoomsRequestSchema>;

export const GetRoomsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().nullable(),
  rooms: z.array(RoomSchema),
});
export type GetRoomsResponse = z.infer<typeof GetRoomsResponseSchema>;

// 6. Update Room
export const UpdateRoomRequestSchema = z.object({
  roomId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  hostEmail: z.string().nullable(),
  hostImage: z.string().nullable(),
});
export type UpdateRoomRequest = z.infer<typeof UpdateRoomRequestSchema>;

export const UpdateRoomResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().nullable(),
});
export type UpdateRoomResponse = z.infer<typeof UpdateRoomResponseSchema>;
