import { createServer } from "http";
import { Server } from "socket.io";

const port = Number(process.env.SIGNALING_PORT ?? "4001");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

type RoomParticipant = {
  userId: string;
  socketId: string;
};

const rooms = new Map<string, RoomParticipant[]>();

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, userId }) => {
    socket.join(roomId);
    const participants = rooms.get(roomId) ?? [];
    participants.push({ userId, socketId: socket.id });
    rooms.set(roomId, participants);
    socket.to(roomId).emit("room:peer-joined", { userId });
    socket.emit("room:peers", {
      peers: participants.filter((peer) => peer.socketId !== socket.id)
    });
  });

  socket.on("room:leave", ({ roomId, userId }) => {
    socket.leave(roomId);
    const participants = rooms.get(roomId) ?? [];
    rooms.set(
      roomId,
      participants.filter((peer) => peer.socketId !== socket.id)
    );
    socket.to(roomId).emit("room:peer-left", { userId });
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      const participants = rooms.get(roomId) ?? [];
      const peer = participants.find((p) => p.socketId === socket.id);
      rooms.set(
        roomId,
        participants.filter((p) => p.socketId !== socket.id)
      );
      if (peer) {
        socket.to(roomId).emit("room:peer-left", { userId: peer.userId });
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Signaling server running on :${port}`);
});
