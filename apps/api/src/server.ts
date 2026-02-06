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

const rooms = new Map<string, Room>();

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

app.listen(port, () => {
  console.log(`API server running on :${port}`);
});
