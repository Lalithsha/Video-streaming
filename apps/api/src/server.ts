import express from "express";
import { randomUUID } from "crypto";

const app = express();
const port = Number(process.env.API_PORT ?? "4000");
const webOrigin = process.env.WEB_ORIGIN ?? "*";

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

type Room = {
  id: string;
  title: string;
  createdAt: string;
  description?: string;
};

type SessionStatus = "scheduled" | "live" | "ended";

type Session = {
  id: string;
  roomId: string;
  status: SessionStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
};

type RecordingStatus = "processing" | "ready" | "failed";

type Recording = {
  id: string;
  sessionId: string;
  status: RecordingStatus;
  createdAt: string;
  url?: string;
  durationSeconds?: number;
};

type Participant = {
  id: string;
  roomId: string;
  name: string;
  role: "host" | "cohost" | "speaker" | "viewer";
  joinedAt: string;
};

const rooms = new Map<string, Room>();
const sessions = new Map<string, Session>();
const recordings = new Map<string, Recording>();
const participants = new Map<string, Participant>();

const getTimestamp = () => new Date().toISOString();

const parseString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const parseRole = (value: unknown): Participant["role"] => {
  if (value === "host" || value === "cohost" || value === "speaker") return value;
  return "viewer";
};

const parseSessionStatus = (value: unknown): SessionStatus | null => {
  if (value === "scheduled" || value === "live" || value === "ended") {
    return value;
  }
  return null;
};

const parseRecordingStatus = (value: unknown): RecordingStatus | null => {
  if (value === "processing" || value === "ready" || value === "failed") {
    return value;
  }
  return null;
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/stats", (_req, res) => {
  const liveSessions = Array.from(sessions.values()).filter(
    (session) => session.status === "live"
  );
  res.json({
    rooms: rooms.size,
    sessions: sessions.size,
    liveSessions: liveSessions.length,
    recordings: recordings.size,
    participants: participants.size
  });
});

app.get("/rooms", (_req, res) => {
  res.json({ rooms: Array.from(rooms.values()) });
});

app.post("/rooms", (req, res) => {
  const title = parseString(req.body?.title, "Untitled");
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
  const room: Room = {
    id: randomUUID(),
    title,
    description,
    createdAt: getTimestamp()
  };
  rooms.set(room.id, room);
  res.status(201).json(room);
});

app.get("/rooms/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(room);
});

app.get("/rooms/:roomId/sessions", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const roomSessions = Array.from(sessions.values()).filter(
    (session) => session.roomId === room.id
  );
  res.json({ sessions: roomSessions });
});

app.post("/rooms/:roomId/sessions", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const session: Session = {
    id: randomUUID(),
    roomId: room.id,
    status: "scheduled",
    createdAt: getTimestamp()
  };
  sessions.set(session.id, session);
  res.status(201).json(session);
});

app.get("/sessions/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});

app.patch("/sessions/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const nextStatus = parseSessionStatus(req.body?.status);
  if (!nextStatus) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const updated: Session = {
    ...session,
    status: nextStatus,
    startedAt: nextStatus === "live" ? getTimestamp() : session.startedAt,
    endedAt: nextStatus === "ended" ? getTimestamp() : session.endedAt
  };
  sessions.set(session.id, updated);
  res.json(updated);
});

app.post("/sessions/:sessionId/recordings", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const recording: Recording = {
    id: randomUUID(),
    sessionId: session.id,
    status: "processing",
    createdAt: getTimestamp(),
    durationSeconds:
      typeof req.body?.durationSeconds === "number" ? req.body.durationSeconds : undefined
  };
  recordings.set(recording.id, recording);
  res.status(201).json(recording);
});

app.get("/sessions/:sessionId/recordings", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const sessionRecordings = Array.from(recordings.values()).filter(
    (recording) => recording.sessionId === session.id
  );
  res.json({ recordings: sessionRecordings });
});

app.patch("/recordings/:recordingId", (req, res) => {
  const recording = recordings.get(req.params.recordingId);
  if (!recording) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }
  const status = parseRecordingStatus(req.body?.status);
  if (!status) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const updated: Recording = {
    ...recording,
    status,
    url: typeof req.body?.url === "string" ? req.body.url : recording.url,
    durationSeconds:
      typeof req.body?.durationSeconds === "number"
        ? req.body.durationSeconds
        : recording.durationSeconds
  };
  recordings.set(recording.id, updated);
  res.json(updated);
});

app.get("/recordings/:recordingId", (req, res) => {
  const recording = recordings.get(req.params.recordingId);
  if (!recording) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }
  res.json(recording);
});

app.post("/rooms/:roomId/participants", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const participant: Participant = {
    id: randomUUID(),
    roomId: room.id,
    name: parseString(req.body?.name, "Guest"),
    role: parseRole(req.body?.role),
    joinedAt: getTimestamp()
  };
  participants.set(participant.id, participant);
  res.status(201).json(participant);
});

app.get("/rooms/:roomId/participants", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const roomParticipants = Array.from(participants.values()).filter(
    (participant) => participant.roomId === room.id
  );
  res.json({ participants: roomParticipants });
});

app.listen(port, () => {
  console.log(`API server running on :${port}`);
});
