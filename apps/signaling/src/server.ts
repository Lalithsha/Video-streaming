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

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit("room:peer-joined", { userId });
  });

  socket.on("room:leave", ({ roomId, userId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit("room:peer-left", { userId });
  });
});

httpServer.listen(port, () => {
  console.log(`Signaling server running on :${port}`);
});
