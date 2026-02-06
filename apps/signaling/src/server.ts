import { randomUUID } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";
import { getToken } from "next-auth/jwt";

const port = Number(process.env.SIGNALING_PORT ?? "4001");
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const mediaWorkerUrl = process.env.MEDIA_WORKER_URL ?? "";
const authRequired = (process.env.AUTH_REQUIRED ?? "false") === "true";
const authSecret = process.env.NEXTAUTH_SECRET;

const startedAt = new Date();

const jsonResponse = (res: import("http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const collectStats = () => {
  const roomsList = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    participants: room.participants.size,
    messages: room.messages.length,
    hasRtpCapabilities: Boolean(room.rtpCapabilities)
  }));
  const totals = roomsList.reduce(
    (acc, room) => {
      acc.participants += room.participants;
      acc.messages += room.messages;
      return acc;
    },
    { participants: 0, messages: 0 }
  );
  return {
    rooms: rooms.size,
    participants: totals.participants,
    messages: totals.messages,
    roomsList
  };
};

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    jsonResponse(res, 200, {
      status: "ok",
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      mediaWorkerConfigured: Boolean(mediaWorkerUrl)
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/stats") {
    jsonResponse(res, 200, {
      ...collectStats(),
      startedAt: startedAt.toISOString()
    });
    return;
  }

  jsonResponse(res, 404, { error: "Not found" });
});
const io = new Server(httpServer, {
  cors: {
    origin: webOrigin,
    methods: ["GET", "POST"],
    credentials: true
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
  producerIds: string[];
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
  producers: Map<string, { id: string; userId: string; kind: string }>;
};

const rooms = new Map<string, RoomState>();

type SocketAuth = {
  userId: string;
  email?: string | null;
  name?: string | null;
};

const getRoomState = (roomId: string) => {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const created: RoomState = {
    participants: new Map(),
    messages: [],
    producers: new Map()
  };
  rooms.set(roomId, created);
  return created;
};

const sanitizeRole = (value: unknown): Role => {
  if (value === "host" || value === "cohost" || value === "speaker") return value;
  return "viewer";
};

const sanitizeText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const resolveAuth = async (socket: import("socket.io").Socket) => {
  if (!authRequired) return null;
  if (!authSecret) return null;
  const authToken =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token
      : undefined;
  const authorizationHeader = socket.handshake.headers.authorization;
  const cookieHeader = socket.handshake.headers.cookie;
  const bearerToken =
    typeof authorizationHeader === "string" ? authorizationHeader : undefined;
  const token = await getToken({
    req: {
      headers: {
        authorization: authToken ? `Bearer ${authToken}` : bearerToken,
        cookie: typeof cookieHeader === "string" ? cookieHeader : undefined
      }
    } as never,
    secret: authSecret
  });
  if (!token?.sub) return null;
  return {
    userId: token.sub,
    email: typeof token.email === "string" ? token.email : null,
    name: typeof token.name === "string" ? token.name : null
  } satisfies SocketAuth;
};

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

const callMediaWorker = async <T>(
  path: string,
  options?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
  if (!mediaWorkerUrl) return { ok: false, error: "Media worker not configured" };
  try {
    const response = await fetch(`${mediaWorkerUrl}${path}`, options);
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text || "Media worker error" };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: "Media worker request failed" };
  }
};

io.on("connection", (socket) => {
  resolveAuth(socket)
    .then((auth) => {
      if (authRequired && !auth) {
        socket.emit("error", "Unauthorized");
        socket.disconnect();
        return;
      }
      socket.data.auth = auth;
    })
    .catch(() => {
      if (authRequired) {
        socket.emit("error", "Unauthorized");
        socket.disconnect();
      }
    });

  socket.on("room:join", async (payload, callback) => {
    if (authRequired && !socket.data.auth) {
      callback?.({ ok: false, error: "Unauthorized" });
      return;
    }
    const roomId = sanitizeText(payload?.roomId, "");
    if (!roomId) {
      callback?.({ ok: false, error: "Missing roomId" });
      return;
    }
    const auth = socket.data.auth as SocketAuth | undefined;
    const userId = auth?.userId ?? sanitizeText(payload?.userId, socket.id);
    const displayName = sanitizeText(payload?.displayName, auth?.name ?? userId);
    const role = sanitizeRole(payload?.role);

    socket.join(roomId);
    const room = getRoomState(roomId);
    const participant: RoomParticipant = {
      userId,
      socketId: socket.id,
      displayName,
      role,
      raisedHand: false,
      joinedAt: new Date().toISOString(),
      producerIds: []
    };
    room.participants.set(socket.id, participant);

    const roster = Array.from(room.participants.values()).filter(
      (peer) => peer.socketId !== socket.id
    );

    socket.to(roomId).emit("room:peer-joined", participant);
    socket.emit("room:roster", {
      peers: roster,
      messages: room.messages,
      rtpCapabilities: room.rtpCapabilities ?? null,
      producers: Array.from(room.producers.values())
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

  socket.on("mediasoup:create-transport", async (payload, callback) => {
    const roomId = sanitizeText(payload?.roomId, "");
    if (!roomId) {
      callback?.({ ok: false, error: "Missing roomId" });
      return;
    }
    const result = await callMediaWorker<{
      id: string;
      iceParameters: unknown;
      iceCandidates: unknown;
      dtlsParameters: unknown;
    }>(`/rooms/${roomId}/transports`, { method: "POST" });
    if (!result.ok) {
      callback?.({ ok: false, error: result.error });
      return;
    }
    callback?.({ ok: true, transportOptions: result.data });
  });

  socket.on("mediasoup:connect-transport", async (payload, callback) => {
    const roomId = sanitizeText(payload?.roomId, "");
    const transportId = sanitizeText(payload?.transportId, "");
    if (!roomId || !transportId) {
      callback?.({ ok: false, error: "Missing data" });
      return;
    }
    const result = await callMediaWorker<{ ok: true }>(
      `/rooms/${roomId}/transports/${transportId}/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dtlsParameters: payload?.dtlsParameters })
      }
    );
    if (!result.ok) {
      callback?.({ ok: false, error: result.error });
      return;
    }
    callback?.({ ok: true });
  });

  socket.on("mediasoup:produce", async (payload, callback) => {
    const roomId = sanitizeText(payload?.roomId, "");
    const transportId = sanitizeText(payload?.transportId, "");
    if (!roomId || !transportId) {
      callback?.({ ok: false, error: "Missing data" });
      return;
    }
    const result = await callMediaWorker<{ id: string; kind: string }>(
      `/rooms/${roomId}/producers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportId,
          kind: payload?.kind,
          rtpParameters: payload?.rtpParameters
        })
      }
    );
    if (!result.ok) {
      callback?.({ ok: false, error: result.error });
      return;
    }
    const room = getRoomState(roomId);
    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.producerIds.push(result.data.id);
    }
    const producerSummary = { id: result.data.id, userId: participant?.userId ?? socket.id, kind: result.data.kind };
    room.producers.set(result.data.id, producerSummary);
    socket.to(roomId).emit("room:producer-added", producerSummary);
    callback?.({ ok: true, producerId: result.data.id });
  });

  socket.on("mediasoup:consume", async (payload, callback) => {
    const roomId = sanitizeText(payload?.roomId, "");
    const transportId = sanitizeText(payload?.transportId, "");
    const producerId = sanitizeText(payload?.producerId, "");
    if (!roomId || !transportId || !producerId) {
      callback?.({ ok: false, error: "Missing data" });
      return;
    }
    const result = await callMediaWorker<{
      id: string;
      producerId: string;
      kind: string;
      rtpParameters: unknown;
    }>(`/rooms/${roomId}/consumers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transportId,
        producerId,
        rtpCapabilities: payload?.rtpCapabilities
      })
    });
    if (!result.ok) {
      callback?.({ ok: false, error: result.error });
      return;
    }
    callback?.({ ok: true, consumerOptions: result.data });
  });

  socket.on("room:leave", (payload) => {
    const roomId = sanitizeText(payload?.roomId, "");
    if (!roomId) return;
    const room = rooms.get(roomId);
    socket.leave(roomId);
    if (!room) return;
    const participant = room.participants.get(socket.id);
    room.participants.delete(socket.id);
    if (participant?.producerIds.length) {
      for (const producerId of participant.producerIds) {
        room.producers.delete(producerId);
        socket.to(roomId).emit("room:producer-removed", { producerId });
      }
    }
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
      if (participant?.producerIds.length) {
        for (const producerId of participant.producerIds) {
          room.producers.delete(producerId);
          socket.to(roomId).emit("room:producer-removed", { producerId });
        }
      }
      if (participant) {
        socket.to(roomId).emit("room:peer-left", { userId: participant.userId });
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Signaling server running on :${port}`);
});
