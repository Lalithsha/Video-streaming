import { z } from "zod";
import { ParticipantRoleSchema } from "./index.js";
import { DtlsParametersSchema, RtpParametersSchema, RtpCapabilitiesSchema } from "./media.js";

// 1. room:join
export const RoomJoinPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string().optional(),
  displayName: z.string().optional(),
  role: ParticipantRoleSchema.optional(),
});
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;

export const RoomJoinResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});
export type RoomJoinResponse = z.infer<typeof RoomJoinResponseSchema>;

// 2. room:peer-joined
export const RoomParticipantSchema = z.object({
  userId: z.string(),
  socketId: z.string(),
  displayName: z.string(),
  role: z.enum(["host", "cohost", "speaker", "viewer"]),
  raisedHand: z.boolean(),
  joinedAt: z.string(),
  producerIds: z.array(z.string()),
});
export type RoomParticipant = z.infer<typeof RoomParticipantSchema>;

// 3. room:peer-left
export const RoomPeerLeftPayloadSchema = z.object({
  userId: z.string(),
});
export type RoomPeerLeftPayload = z.infer<typeof RoomPeerLeftPayloadSchema>;

// 4. room:roster
export const ProducerSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: z.string(),
});
export type ProducerSummary = z.infer<typeof ProducerSummarySchema>;

export const RoomMessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  displayName: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export type RoomMessage = z.infer<typeof RoomMessageSchema>;

export const RoomRosterPayloadSchema = z.object({
  peers: z.array(RoomParticipantSchema),
  messages: z.array(RoomMessageSchema),
  rtpCapabilities: z.unknown().nullable(),
  producers: z.array(ProducerSummarySchema),
});
export type RoomRosterPayload = z.infer<typeof RoomRosterPayloadSchema>;

// 5. room:message
export const SendMessagePayloadSchema = z.object({
  roomId: z.string(),
  message: z.string(),
});
export type SendMessagePayload = z.infer<typeof SendMessagePayloadSchema>;

// 6. room:raise-hand
export const RaiseHandPayloadSchema = z.object({
  roomId: z.string(),
  raisedHand: z.boolean(),
});
export type RaiseHandPayload = z.infer<typeof RaiseHandPayloadSchema>;

export const HandRaisedPayloadSchema = z.object({
  userId: z.string(),
  raisedHand: z.boolean(),
});
export type HandRaisedPayload = z.infer<typeof HandRaisedPayloadSchema>;

// 7. mediasoup:create-transport
export const CreateTransportPayloadSchema = z.object({
  roomId: z.string(),
});
export type CreateTransportPayload = z.infer<typeof CreateTransportPayloadSchema>;

export const CreateTransportResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    transportOptions: z.object({
      id: z.string(),
      iceParameters: z.unknown(),
      iceCandidates: z.unknown(),
      dtlsParameters: z.unknown(),
      sctpParameters: z.unknown().optional(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);
export type CreateTransportResponse = z.infer<typeof CreateTransportResponseSchema>;

// 8. mediasoup:connect-transport
export const ConnectTransportPayloadSchema = z.object({
  roomId: z.string(),
  transportId: z.string(),
  dtlsParameters: DtlsParametersSchema,
});
export type ConnectTransportPayload = z.infer<typeof ConnectTransportPayloadSchema>;

export const ConnectTransportResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ConnectTransportResponse = z.infer<typeof ConnectTransportResponseSchema>;

// 9. mediasoup:produce
export const ProducePayloadSchema = z.object({
  roomId: z.string(),
  transportId: z.string(),
  kind: z.enum(["audio", "video"]),
  rtpParameters: RtpParametersSchema,
});
export type ProducePayload = z.infer<typeof ProducePayloadSchema>;

export const ProduceResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    producerId: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);
export type ProduceResponse = z.infer<typeof ProduceResponseSchema>;

// 10. mediasoup:consume
export const ConsumePayloadSchema = z.object({
  roomId: z.string(),
  transportId: z.string(),
  producerId: z.string(),
  rtpCapabilities: RtpCapabilitiesSchema,
});
export type ConsumePayload = z.infer<typeof ConsumePayloadSchema>;

export const ConsumeResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    consumerOptions: z.object({
      id: z.string(),
      producerId: z.string(),
      kind: z.string(),
      rtpParameters: z.unknown(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);
export type ConsumeResponse = z.infer<typeof ConsumeResponseSchema>;

// 11. active-speaker (Phase 2C)
export const ActiveSpeakerPayloadSchema = z.object({
  peerId: z.string(),
  volume: z.number().optional(),
});
export type ActiveSpeakerPayload = z.infer<typeof ActiveSpeakerPayloadSchema>;

// 12. transcript-chunk (Phase 2A)
export const TranscriptChunkPayloadSchema = z.object({
  sessionId: z.string(),
  speakerId: z.string(),
  content: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});
export type TranscriptChunkPayload = z.infer<typeof TranscriptChunkPayloadSchema>;

// 13. room:reconnect (Phase 1.5)
export const RoomReconnectPayloadSchema = z.object({
  roomId: z.string(),
  sessionRecoveryToken: z.string(),
  lastSeqNum: z.number(),
});
export type RoomReconnectPayload = z.infer<typeof RoomReconnectPayloadSchema>;
