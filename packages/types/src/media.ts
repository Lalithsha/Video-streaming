import { z } from "zod";

// MediaKind
export const MediaKindSchema = z.enum(["audio", "video"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;

// IceParameters
export const IceParametersSchema = z.object({
  usernameFragment: z.string(),
  password: z.string(),
  iceLite: z.boolean().optional(),
});
export type IceParameters = z.infer<typeof IceParametersSchema>;

// IceCandidate
export const IceCandidateSchema = z.object({
  foundation: z.string(),
  priority: z.number(),
  ip: z.string(),
  address: z.string(),
  protocol: z.enum(["udp", "tcp"]),
  port: z.number(),
  type: z.enum(["host"]),
  tcpType: z.enum(["passive"]).optional(),
});
export type IceCandidate = z.infer<typeof IceCandidateSchema>;

// DtlsFingerprint
export const DtlsFingerprintSchema = z.object({
  algorithm: z.enum(["sha-1", "sha-224", "sha-256", "sha-384", "sha-512"]),
  value: z.string(),
});
export type DtlsFingerprint = z.infer<typeof DtlsFingerprintSchema>;

// DtlsParameters
export const DtlsParametersSchema = z.object({
  role: z.enum(["auto", "client", "server"]).optional(),
  fingerprints: z.array(DtlsFingerprintSchema),
});
export type DtlsParameters = z.infer<typeof DtlsParametersSchema>;

// SctpParameters
export const SctpParametersSchema = z.object({
  port: z.number(),
  OS: z.number(),
  MIS: z.number(),
  maxMessageSize: z.number(),
});
export type SctpParameters = z.infer<typeof SctpParametersSchema>;

// TransportOptions returned to client
export const TransportOptionsSchema = z.object({
  id: z.string(),
  iceParameters: IceParametersSchema,
  iceCandidates: z.array(IceCandidateSchema),
  dtlsParameters: DtlsParametersSchema,
  sctpParameters: SctpParametersSchema.optional(),
});
export type TransportOptions = z.infer<typeof TransportOptionsSchema>;

// RtcpFeedback
export const RtcpFeedbackSchema = z.object({
  type: z.string(),
  parameter: z.string().optional(),
});

// RtpCodecParameters
export const RtpCodecParametersSchema = z.object({
  mimeType: z.string(),
  payloadType: z.number(),
  clockRate: z.number(),
  channels: z.number().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  rtcpFeedback: z.array(RtcpFeedbackSchema).optional(),
});

// RtpHeaderExtensionParameters
export const RtpHeaderExtensionParametersSchema = z.object({
  uri: z.string(),
  id: z.number(),
  encrypt: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

// RtpEncodingParameters
export const RtpEncodingParametersSchema = z.object({
  ssrc: z.number().optional(),
  rid: z.string().optional(),
  codecPayloadType: z.number().optional(),
  rtx: z.object({ ssrc: z.number() }).optional(),
  dtx: z.boolean().optional(),
  scalabilityMode: z.string().optional(),
  maxBitrate: z.number().optional(),
});

// RtcpParameters
export const RtcpParametersSchema = z.object({
  cname: z.string().optional(),
  reducedSize: z.boolean().optional(),
});

// RtpParameters
export const RtpParametersSchema = z.object({
  mid: z.string().optional(),
  codecs: z.array(RtpCodecParametersSchema),
  headerExtensions: z.array(RtpHeaderExtensionParametersSchema).optional(),
  encodings: z.array(RtpEncodingParametersSchema).optional(),
  rtcp: RtcpParametersSchema.optional(),
  msid: z.string().optional(),
});
export type RtpParameters = z.infer<typeof RtpParametersSchema>;

// RtpCodecCapability
export const RtpCodecCapabilitySchema = z.object({
  kind: MediaKindSchema,
  mimeType: z.string(),
  preferredPayloadType: z.number().optional(),
  clockRate: z.number(),
  channels: z.number().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  rtcpFeedback: z.array(RtcpFeedbackSchema).optional(),
});

// RtpHeaderExtension
export const RtpHeaderExtensionSchema = z.object({
  kind: MediaKindSchema,
  uri: z.string(),
  preferredId: z.number(),
  preferredEncrypt: z.boolean().optional(),
  direction: z.enum(["sendrecv", "sendonly", "recvonly", "inactive"]).optional(),
});

// RtpCapabilities
export const RtpCapabilitiesSchema = z.object({
  codecs: z.array(RtpCodecCapabilitySchema).optional(),
  headerExtensions: z.array(RtpHeaderExtensionSchema).optional(),
});
export type RtpCapabilities = z.infer<typeof RtpCapabilitiesSchema>;

// SctpStreamParameters
export const SctpStreamParametersSchema = z.object({
  streamId: z.number(),
  ordered: z.boolean().optional(),
  maxPacketLifeTime: z.number().optional(),
  maxRetransmits: z.number().optional(),
});
export type SctpStreamParameters = z.infer<typeof SctpStreamParametersSchema>;
