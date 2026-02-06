import { randomUUID } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

const port = Number(process.env.SIGNALING_PORT ?? "4001");
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const mediaWorkerUrl = process.env.MEDIA_WORKER_URL ?? "";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: webOrigin,
    methods: ["GET", "POST"]
  }
});

type Role = "host" | "cohost" | "speaker" | "viewer";

type RoomParticipant = {
  userId: string;
  socketId: string;
  displayName: string;
  role: Role;
  raisedHand: boolean;
  joinedAt: string;
};

type RoomMessage = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  message: string;
  createdAt: string;
};

type RoomState = {
  participants: Map<string, RoomParticipant>;
  messages: RoomMessage[];
  rtpCapabilities?: unknown;
};

const rooms = new Map<string, RoomState>();

const getRoomState = (roomId: string) => {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const created: RoomState = { participants: new Map(), messages: [] };
  rooms.set(roomId, created);
  return created;
};

const sanitizeRole = (value: unknown): Role => {
  if (value === "host" || value === "cohost" || value === "speaker") return value;
  return "viewer";
};

const sanitizeText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const fetchRtpCapabilities = async (roomId: string) => {
  if (!mediaWorkerUrl) return null;
  try {
    const createResponse = await fetch(`${mediaWorkerUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId })
    });
    if (!createResponse.ok) return null;
    const data = (await createResponse.json()) as { rtpCapabilities?: unknown };
    return data.rtpCapabilities ?? null;
  } catch (error) {
    console.warn("Failed to fetch RTP capabilities", error);
    return null;
  }
};

io.on("connection", (socket) => {
  socket.on("room:join", async (payload, callback) => {
    const roomId = sanitizeText(payload?.roomId, "");
    if (!roomId) {
      callback?.({ ok: false, error: "Missing roomId" });
      return;
    }
    const userId = sanitizeText(payload?.userId, socket.id);
    const displayName = sanitizeText(payload?.displayName, userId);
    const role = sanitizeRole(payload?.role);

    socket.join(roomId);
    const room = getRoomState(roomId);
    const participant: RoomParticipant = {
      userId,
      socketId: socket.id,
      displayName,
      role,
      raisedHand: false,
      joinedAt: new Date().toISOString()
    };
    room.participants.set(socket.id, participant);

    const roster = Array.from(room.participants.values()).filter(
      (peer) => peer.socketId !== socket.id
    );

    socket.to(roomId).emit("room:peer-joined", participant);
    socket.emit("room:roster", {
      peers: roster,
      messages: room.messages,
      rtpCapabilities: room.rtpCapabilities ?? null
    });

    if (!room.rtpCapabilities) {
      const rtpCapabilities = await fetchRtpCapabilities(roomId);
      if (rtpCapabilities) {
        room.rtpCapabilities = rtpCapabilities;
        io.to(roomId).emit("room:rtp-capabilities", { rtpCapabilities });
      }
    }

    callback?.({ ok: true });
  });

  socket.on("room:leave", (payload) => {
    const roomId = sanitizeText(payload?.roomId, "");
    if (!roomId) return;
    const room = rooms.get(roomId);
    socket.leave(roomId);
    if (!room) return;
    const participant = room.participants.get(socket.id);
    room.participants.delete(socket.id);
    if (participant) {
      socket.to(roomId).emit("room:peer-left", { userId: participant.userId });
    }
  });

  socket.on("room:message", (payload, callback) => {
    const roomId = sanitizeText(payload?.roomId, "");
    const messageText = sanitizeText(payload?.message, "");
    if (!roomId || !messageText) {
      callback?.({ ok: false, error: "Missing data" });
      return;
    }
    const room = getRoomState(roomId);
    const sender = room.participants.get(socket.id);
    if (!sender) {
      callback?.({ ok: false, error: "Not in room" });
      return;
    }
    const message: RoomMessage = {
      id: randomUUID(),
      roomId,
      userId: sender.userId,
      displayName: sender.displayName,
      message: messageText,
      createdAt: new Date().toISOString()
    };
    room.messages = [...room.messages.slice(-49), message];
    io.to(roomId).emit("room:message", message);
    callback?.({ ok: true });
  });

  socket.on("room:raise-hand", (payload) => {
    const roomId = sanitizeText(payload?.roomId, "");
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const participant = room.participants.get(socket.id);
    if (!participant) return;
    const raisedHand = Boolean(payload?.raisedHand);
    const updated: RoomParticipant = { ...participant, raisedHand };
    room.participants.set(socket.id, updated);
    io.to(roomId).emit("room:hand-raised", {
      userId: updated.userId,
      raisedHand: updated.raisedHand
    });
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      const room = rooms.get(roomId);
      if (!room) continue;
      const participant = room.participants.get(socket.id);
      room.participants.delete(socket.id);
      if (participant) {
        socket.to(roomId).emit("room:peer-left", { userId: participant.userId });
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Signaling server running on :${port}`);
});
