import express from "express";
import { randomUUID } from "crypto";
import { PrismaClient, RecordingStatus, SessionStatus, ParticipantRole } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const app = express();
const port = Number(process.env.API_PORT ?? "4000");
const webOrigin = process.env.WEB_ORIGIN ?? "*";
const authRequired = (process.env.AUTH_REQUIRED ?? "false") === "true";
const authSecret = process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

type AuthContext = {
  userId: string;
  email?: string | null;
  name?: string | null;
};

const parseString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const parseRole = (value: unknown): ParticipantRole => {
  if (value === "host") return ParticipantRole.HOST;
  if (value === "cohost") return ParticipantRole.COHOST;
  if (value === "speaker") return ParticipantRole.SPEAKER;
  return ParticipantRole.VIEWER;
};

const parseSessionStatus = (value: unknown): SessionStatus | null => {
  if (value === "scheduled") return SessionStatus.SCHEDULED;
  if (value === "live") return SessionStatus.LIVE;
  if (value === "ended") return SessionStatus.ENDED;
  return null;
};

const parseRecordingStatus = (value: unknown): RecordingStatus | null => {
  if (value === "processing") return RecordingStatus.PROCESSING;
  if (value === "ready") return RecordingStatus.READY;
  if (value === "failed") return RecordingStatus.FAILED;
  return null;
};

const mapSessionStatus = (status: SessionStatus) =>
  status === SessionStatus.SCHEDULED ? "scheduled" : status === SessionStatus.LIVE ? "live" : "ended";

const mapRecordingStatus = (status: RecordingStatus) =>
  status === RecordingStatus.PROCESSING ? "processing" : status === RecordingStatus.READY ? "ready" : "failed";

const mapRole = (role: ParticipantRole) =>
  role === ParticipantRole.HOST
    ? "host"
    : role === ParticipantRole.COHOST
      ? "cohost"
      : role === ParticipantRole.SPEAKER
        ? "speaker"
        : "viewer";

const attachAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!authRequired) {
    next();
    return;
  }
  if (!authSecret) {
    res.status(500).json({ error: "Missing NEXTAUTH_SECRET" });
    return;
  }
  const token = await getToken({ req: req as never, secret: authSecret });
  if (!token || !token.sub) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as express.Request & { auth?: AuthContext }).auth = {
    userId: token.sub,
    email: typeof token.email === "string" ? token.email : null,
    name: typeof token.name === "string" ? token.name : null
  };
  next();
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/stats", async (_req, res) => {
  const [roomsCount, sessionsCount, recordingsCount, participantsCount, liveSessions] =
    await Promise.all([
      prisma.room.count(),
      prisma.session.count(),
      prisma.recording.count(),
      prisma.participant.count(),
      prisma.session.count({ where: { status: SessionStatus.LIVE } })
    ]);
  res.json({
    rooms: roomsCount,
    sessions: sessionsCount,
    liveSessions,
    recordings: recordingsCount,
    participants: participantsCount
  });
});

app.get("/rooms", async (_req, res) => {
  const rooms = await prisma.room.findMany({ orderBy: { createdAt: "desc" } });
  res.json({
    rooms: rooms.map((room) => ({
      ...room,
      createdAt: room.createdAt.toISOString()
    }))
  });
});

app.post("/rooms", attachAuth, async (req, res) => {
  const title = parseString(req.body?.title, "Untitled");
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
  const auth = (req as express.Request & { auth?: AuthContext }).auth;
  if (auth && auth.email) {
    await prisma.user.upsert({
      where: { email: auth.email },
      update: { name: auth.name ?? undefined },
      create: { id: auth.userId, email: auth.email, name: auth.name ?? undefined }
    });
  }
  const room = await prisma.room.create({
    data: {
      id: randomUUID(),
      title,
      description,
      hostId: auth?.userId ?? null
    }
  });
  res.status(201).json({
    ...room,
    createdAt: room.createdAt.toISOString()
  });
});

app.get("/rooms/:roomId", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({
    ...room,
    createdAt: room.createdAt.toISOString()
  });
});

app.get("/rooms/:roomId/sessions", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const roomSessions = await prisma.session.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: "desc" }
  });
  res.json({
    sessions: roomSessions.map((session) => ({
      ...session,
      status: mapSessionStatus(session.status),
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString(),
      endedAt: session.endedAt?.toISOString()
    }))
  });
});

app.post("/rooms/:roomId/sessions", attachAuth, async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      roomId: room.id
    }
  });
  res.status(201).json({
    ...session,
    status: mapSessionStatus(session.status),
    createdAt: session.createdAt.toISOString()
  });
});

app.get("/sessions/:sessionId", async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({
    ...session,
    status: mapSessionStatus(session.status),
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    endedAt: session.endedAt?.toISOString()
  });
});

app.patch("/sessions/:sessionId", attachAuth, async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const nextStatus = parseSessionStatus(req.body?.status);
  if (!nextStatus) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      status: nextStatus,
      startedAt: nextStatus === SessionStatus.LIVE ? new Date() : session.startedAt,
      endedAt: nextStatus === SessionStatus.ENDED ? new Date() : session.endedAt
    }
  });
  res.json({
    ...updated,
    status: mapSessionStatus(updated.status),
    createdAt: updated.createdAt.toISOString(),
    startedAt: updated.startedAt?.toISOString(),
    endedAt: updated.endedAt?.toISOString()
  });
});

app.post("/sessions/:sessionId/recordings", attachAuth, async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const recording = await prisma.recording.create({
    data: {
      id: randomUUID(),
      sessionId: session.id,
      durationSeconds:
        typeof req.body?.durationSeconds === "number" ? req.body.durationSeconds : undefined
    }
  });
  res.status(201).json({
    ...recording,
    status: mapRecordingStatus(recording.status),
    createdAt: recording.createdAt.toISOString()
  });
});

app.get("/sessions/:sessionId/recordings", async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const sessionRecordings = await prisma.recording.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" }
  });
  res.json({
    recordings: sessionRecordings.map((recording) => ({
      ...recording,
      status: mapRecordingStatus(recording.status),
      createdAt: recording.createdAt.toISOString()
    }))
  });
});

app.patch("/recordings/:recordingId", attachAuth, async (req, res) => {
  const recording = await prisma.recording.findUnique({
    where: { id: req.params.recordingId }
  });
  if (!recording) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }
  const status = parseRecordingStatus(req.body?.status);
  if (!status) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const updated = await prisma.recording.update({
    where: { id: recording.id },
    data: {
      status,
      url: typeof req.body?.url === "string" ? req.body.url : recording.url,
      durationSeconds:
        typeof req.body?.durationSeconds === "number"
          ? req.body.durationSeconds
          : recording.durationSeconds
    }
  });
  res.json({
    ...updated,
    status: mapRecordingStatus(updated.status),
    createdAt: updated.createdAt.toISOString()
  });
});

app.get("/recordings/:recordingId", async (req, res) => {
  const recording = await prisma.recording.findUnique({
    where: { id: req.params.recordingId }
  });
  if (!recording) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }
  res.json({
    ...recording,
    status: mapRecordingStatus(recording.status),
    createdAt: recording.createdAt.toISOString()
  });
});

app.post("/rooms/:roomId/participants", attachAuth, async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const auth = (req as express.Request & { auth?: AuthContext }).auth;
  if (auth && auth.email) {
    await prisma.user.upsert({
      where: { email: auth.email },
      update: { name: auth.name ?? undefined },
      create: { id: auth.userId, email: auth.email, name: auth.name ?? undefined }
    });
  }
  const participant = await prisma.participant.create({
    data: {
      id: randomUUID(),
      roomId: room.id,
      userId: auth?.userId ?? null,
      name: parseString(req.body?.name, auth?.name ?? "Guest"),
      role: parseRole(req.body?.role)
    }
  });
  res.status(201).json({
    ...participant,
    role: mapRole(participant.role),
    joinedAt: participant.joinedAt.toISOString()
  });
});

app.get("/rooms/:roomId/participants", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const roomParticipants = await prisma.participant.findMany({
    where: { roomId: room.id },
    orderBy: { joinedAt: "asc" }
  });
  res.json({
    participants: roomParticipants.map((participant) => ({
      ...participant,
      role: mapRole(participant.role),
      joinedAt: participant.joinedAt.toISOString()
    }))
  });
});

app.listen(port, () => {
  console.log(`API server running on :${port}`);
});
