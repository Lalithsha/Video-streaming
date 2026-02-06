import { randomUUID } from "crypto";
import http from "http";
import os from "os";
import {
  createWorker,
  type Consumer,
  type Producer,
  type Router,
  type WebRtcTransport,
  type Worker
} from "mediasoup";

const port = Number(process.env.MEDIA_WORKER_PORT ?? "4002");
const workerCount = Number(process.env.MEDIASOUP_WORKERS ?? os.cpus().length);

const startedAt = new Date();

const mediaCodecs = [
  {
    kind: "audio" as const,
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2
  },
  {
    kind: "video" as const,
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000
    }
  }
];

type RoomState = {
  id: string;
  router: Router;
  worker: Worker;
  createdAt: string;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
};

const workers: Worker[] = [];
const rooms = new Map<string, RoomState>();
let nextWorkerIndex = 0;

const getNextWorker = () => {
  const worker = workers[nextWorkerIndex % workers.length];
  nextWorkerIndex += 1;
  return worker;
};

const createWorkers = async () => {
  const count = Number.isFinite(workerCount) && workerCount > 0 ? workerCount : 1;
  for (let index = 0; index < count; index += 1) {
    const worker = await createWorker({
      logLevel: "warn",
      logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"]
    });
    worker.on("died", () => {
      console.error("MediaSoup worker died, exiting.");
      process.exit(1);
    });
    workers.push(worker);
    console.log("MediaSoup worker started", worker.pid);
  }
};

const getOrCreateRoom = async (roomId: string) => {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const worker = getNextWorker();
  const router = await worker.createRouter({ mediaCodecs });
  const room: RoomState = {
    id: roomId,
    router,
    worker,
    createdAt: new Date().toISOString(),
    transports: new Map(),
    producers: new Map()
  };
  rooms.set(roomId, room);
  return room;
};

const jsonResponse = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const parseBody = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch (error) {
    return null;
  }
};

const createWebRtcTransport = async (router: Router) => {
  const listenIps = [
    {
      ip: "0.0.0.0",
      announcedIp: process.env.ANNOUNCED_IP ?? undefined
    }
  ];
  return router.createWebRtcTransport({
    listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true
  });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/health") {
    jsonResponse(res, 200, {
      status: "ok",
      workers: workers.length,
      rooms: rooms.size,
      startedAt: startedAt.toISOString()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats") {
    jsonResponse(res, 200, {
      workers: workers.length,
      rooms: rooms.size,
      roomIds: Array.from(rooms.keys()),
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/rooms") {
    const body = await parseBody(req);
    const roomId = typeof body?.roomId === "string" ? body.roomId : randomUUID();
    const room = await getOrCreateRoom(roomId);
    jsonResponse(res, 201, {
      roomId: room.id,
      rtpCapabilities: room.router.rtpCapabilities,
      createdAt: room.createdAt
    });
    return;
  }

  const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)(?:\/rtp-capabilities)?$/);
  if (roomMatch && req.method === "GET") {
    const roomId = roomMatch[1];
    const room = rooms.get(roomId);
    if (!room) {
      jsonResponse(res, 404, { error: "Room not found" });
      return;
    }
    jsonResponse(res, 200, {
      roomId: room.id,
      rtpCapabilities: room.router.rtpCapabilities,
      createdAt: room.createdAt
    });
    return;
  }

  if (roomMatch && req.method === "DELETE") {
    const roomId = roomMatch[1];
    const room = rooms.get(roomId);
    if (!room) {
      jsonResponse(res, 404, { error: "Room not found" });
      return;
    }
    await room.router.close();
    for (const transport of room.transports.values()) {
      transport.close();
    }
    rooms.delete(roomId);
    jsonResponse(res, 200, { ok: true });
    return;
  }

  const transportMatch = url.pathname.match(/^\/rooms\/([^/]+)\/transports$/);
  if (transportMatch && req.method === "POST") {
    const roomId = transportMatch[1];
    const room = await getOrCreateRoom(roomId);
    const transport = await createWebRtcTransport(room.router);
    room.transports.set(transport.id, transport);
    transport.on("close", () => {
      room.transports.delete(transport.id);
    });
    jsonResponse(res, 201, {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    });
    return;
  }

  const transportConnectMatch = url.pathname.match(
    /^\/rooms\/([^/]+)\/transports\/([^/]+)\/connect$/
  );
  if (transportConnectMatch && req.method === "POST") {
    const roomId = transportConnectMatch[1];
    const transportId = transportConnectMatch[2];
    const room = rooms.get(roomId);
    if (!room) {
      jsonResponse(res, 404, { error: "Room not found" });
      return;
    }
    const transport = room.transports.get(transportId);
    if (!transport) {
      jsonResponse(res, 404, { error: "Transport not found" });
      return;
    }
    const body = await parseBody(req);
    if (!body?.dtlsParameters) {
      jsonResponse(res, 400, { error: "Missing dtlsParameters" });
      return;
    }
    await transport.connect({ dtlsParameters: body.dtlsParameters });
    jsonResponse(res, 200, { ok: true });
    return;
  }

  const producerMatch = url.pathname.match(/^\/rooms\/([^/]+)\/producers$/);
  if (producerMatch && req.method === "POST") {
    const roomId = producerMatch[1];
    const room = rooms.get(roomId);
    if (!room) {
      jsonResponse(res, 404, { error: "Room not found" });
      return;
    }
    const body = await parseBody(req);
    const transport = room.transports.get(body?.transportId);
    if (!transport) {
      jsonResponse(res, 404, { error: "Transport not found" });
      return;
    }
    const producer = await transport.produce({
      kind: body.kind,
      rtpParameters: body.rtpParameters
    });
    room.producers.set(producer.id, producer);
    producer.on("close", () => {
      room.producers.delete(producer.id);
    });
    jsonResponse(res, 201, { id: producer.id, kind: producer.kind });
    return;
  }

  const consumerMatch = url.pathname.match(/^\/rooms\/([^/]+)\/consumers$/);
  if (consumerMatch && req.method === "POST") {
    const roomId = consumerMatch[1];
    const room = rooms.get(roomId);
    if (!room) {
      jsonResponse(res, 404, { error: "Room not found" });
      return;
    }
    const body = await parseBody(req);
    const transport = room.transports.get(body?.transportId);
    if (!transport) {
      jsonResponse(res, 404, { error: "Transport not found" });
      return;
    }
    const producerId = body?.producerId;
    const rtpCapabilities = body?.rtpCapabilities;
    if (!producerId || !rtpCapabilities) {
      jsonResponse(res, 400, { error: "Missing producerId or rtpCapabilities" });
      return;
    }
    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      jsonResponse(res, 400, { error: "Cannot consume" });
      return;
    }
    const consumer: Consumer = await transport.consume({
      producerId,
      rtpCapabilities
    });
    jsonResponse(res, 201, {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    });
    return;
  }

  jsonResponse(res, 404, { error: "Not found" });
});

const shutdown = async () => {
  console.log("Shutting down media worker service...");
  for (const room of rooms.values()) {
    for (const producer of room.producers.values()) {
      producer.close();
    }
    for (const transport of room.transports.values()) {
      transport.close();
    }
    await room.router.close();
  }
  for (const worker of workers) {
    worker.close();
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

createWorkers()
  .then(() => {
    server.listen(port, () => {
      console.log(`Media worker service running on :${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start MediaSoup workers", error);
    process.exit(1);
  });
