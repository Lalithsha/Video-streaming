import express from "express";
import { randomUUID } from "crypto";

const app = express();
const port = Number(process.env.API_PORT ?? "4000");

app.use(express.json());

type Room = {
  id: string;
  title: string;
  createdAt: string;
};

type Session = {
  id: string;
  roomId: string;
  status: "scheduled" | "live" | "ended";
  createdAt: string;
};

const rooms = new Map<string, Room>();
const sessions = new Map<string, Session>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/rooms", (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title : "Untitled";
  const room: Room = {
    id: randomUUID(),
    title,
    createdAt: new Date().toISOString()
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
    createdAt: new Date().toISOString()
  };
  sessions.set(session.id, session);
  res.status(201).json(session);
});

app.patch("/sessions/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const nextStatus = req.body?.status;
  if (nextStatus !== "scheduled" && nextStatus !== "live" && nextStatus !== "ended") {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const updated = { ...session, status: nextStatus };
  sessions.set(session.id, updated);
  res.json(updated);
});

app.listen(port, () => {
  console.log(`API server running on :${port}`);
});
