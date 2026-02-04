"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type Room = {
  id: string;
  title: string;
  createdAt: string;
};

type Peer = {
  userId: string;
  socketId: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4001";

export default function HomePage() {
  const { data: session } = useSession();
  const [roomTitle, setRoomTitle] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  const userId = useMemo(
    () => session?.user?.email ?? session?.user?.name ?? "guest",
    [session]
  );

  const createRoom = useCallback(async () => {
    const response = await fetch(`${apiUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: roomTitle || "Live class" })
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as Room;
    setRoom(data);
    setRoomId(data.id);
  }, [roomTitle]);

  const joinRoom = useCallback(async () => {
    if (!roomId) return;
    const response = await fetch(`${apiUrl}/rooms/${roomId}`);
    if (!response.ok) {
      setRoom(null);
      return;
    }
    const data = (await response.json()) as Room;
    setRoom(data);
    const client = io(signalingUrl);
    setSocket(client);
    client.emit("room:join", { roomId, userId });
  }, [roomId, userId]);

  useEffect(() => {
    if (!socket) return;

    const handlePeers = ({ peers: nextPeers }: { peers: Peer[] }) => {
      setPeers(nextPeers);
    };
    const handlePeerJoined = ({ userId: peerId }: { userId: string }) => {
      setPeers((prev) => [...prev, { userId: peerId, socketId: "unknown" }]);
    };
    const handlePeerLeft = ({ userId: peerId }: { userId: string }) => {
      setPeers((prev) => prev.filter((peer) => peer.userId !== peerId));
    };

    socket.on("room:peers", handlePeers);
    socket.on("room:peer-joined", handlePeerJoined);
    socket.on("room:peer-left", handlePeerLeft);

    return () => {
      socket.off("room:peers", handlePeers);
      socket.off("room:peer-joined", handlePeerJoined);
      socket.off("room:peer-left", handlePeerLeft);
      socket.disconnect();
    };
  }, [socket]);

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Creator Studio</h1>
      <p>Live classes with MediaSoup, NextAuth, and Socket.IO.</p>
      <div style={{ marginTop: "1rem" }}>
        {session?.user ? (
          <>
            <p>Signed in as {session.user.email ?? session.user.name}.</p>
            <button type="button" onClick={() => signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <button type="button" onClick={() => signIn("github")}>
            Sign in
          </button>
        )}
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2>Rooms</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Room title"
            value={roomTitle}
            onChange={(event) => setRoomTitle(event.target.value)}
          />
          <button type="button" onClick={createRoom}>
            Create room
          </button>
        </div>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          />
          <button type="button" onClick={joinRoom}>
            Join room
          </button>
        </div>

        {room ? (
          <div style={{ marginTop: "1rem" }}>
            <h3>{room.title}</h3>
            <p>Room ID: {room.id}</p>
            <p>Created: {new Date(room.createdAt).toLocaleString()}</p>
            <p>Peers: {peers.length}</p>
            <ul>
              {peers.map((peer) => (
                <li key={`${peer.userId}-${peer.socketId}`}>{peer.userId}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ marginTop: "1rem" }}>No room joined yet.</p>
        )}
      </section>
    </main>
  );
}
