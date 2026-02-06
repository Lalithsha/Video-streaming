"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { useRoomStore } from "../store/roomStore";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const signalingUrl =
  process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4001";

const roleOptions = [
  { value: "host", label: "Host" },
  { value: "cohost", label: "Co-host" },
  { value: "speaker", label: "Speaker" },
  { value: "viewer", label: "Viewer" }
] as const;

type Role = (typeof roleOptions)[number]["value"];

type ApiRoom = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
};

type ApiSession = {
  id: string;
  roomId: string;
  status: "scheduled" | "live" | "ended";
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
};

export default function HomePage() {
  const { data: sessionData } = useSession();
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [roomId, setRoomId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("host");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [handRaised, setHandRaised] = useState(false);

  const {
    room,
    session,
    peers,
    rtpCapabilities,
    setRoom,
    setSession,
    setPeers,
    setRtpCapabilities,
    reset
  } = useRoomStore();

  const userId = useMemo(
    () => sessionData?.user?.email ?? sessionData?.user?.name ?? "guest",
    [sessionData]
  );

  const resolvedDisplayName = displayName || sessionData?.user?.name || userId;

  const fetchRoomSessions = useCallback(async (targetRoomId: string) => {
    const response = await fetch(`${apiUrl}/rooms/${targetRoomId}/sessions`);
    if (!response.ok) return null;
    const data = (await response.json()) as { sessions: ApiSession[] };
    if (!data.sessions.length) return null;
    return data.sessions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, []);

  const connectSocket = useCallback(
    (targetRoomId: string) => {
      const client = io(signalingUrl, { transports: ["websocket"] });
      setSocket(client);
      client.emit(
        "room:join",
        {
          roomId: targetRoomId,
          userId,
          displayName: resolvedDisplayName,
          role
        },
        () => {
          setHandRaised(false);
        }
      );
    },
    [resolvedDisplayName, role, userId]
  );

  const createRoom = useCallback(async () => {
    const response = await fetch(`${apiUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: roomTitle || "Live class",
        description: roomDescription || undefined
      })
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as ApiRoom;
    setRoom(data);
    setRoomId(data.id);

    const sessionResponse = await fetch(`${apiUrl}/rooms/${data.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (sessionResponse.ok) {
      const sessionData = (await sessionResponse.json()) as ApiSession;
      setSession(sessionData);
    }

    connectSocket(data.id);
  }, [connectSocket, roomDescription, roomTitle, setRoom, setSession]);

  const joinRoom = useCallback(async () => {
    if (!roomId) return;
    const response = await fetch(`${apiUrl}/rooms/${roomId}`);
    if (!response.ok) {
      reset();
      return;
    }
    const data = (await response.json()) as ApiRoom;
    setRoom(data);

    const latestSession = await fetchRoomSessions(roomId);
    if (latestSession) {
      setSession(latestSession);
    } else {
      setSession(null);
    }

    connectSocket(roomId);
  }, [connectSocket, fetchRoomSessions, reset, roomId, setRoom, setSession]);

  const leaveRoom = useCallback(() => {
    if (socket && roomId) {
      socket.emit("room:leave", { roomId, userId });
      socket.disconnect();
      setSocket(null);
    }
    setHandRaised(false);
    reset();
  }, [reset, roomId, socket, userId]);

  const toggleHandRaise = useCallback(() => {
    if (!socket || !roomId) return;
    const nextValue = !handRaised;
    setHandRaised(nextValue);
    socket.emit("room:raise-hand", { roomId, raisedHand: nextValue });
  }, [handRaised, roomId, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleRoster = ({
      peers: nextPeers,
      rtpCapabilities: nextRtpCapabilities
    }: {
      peers: typeof peers;
      rtpCapabilities: unknown | null;
    }) => {
      setPeers(nextPeers);
      setRtpCapabilities(nextRtpCapabilities);
    };
    const handlePeerJoined = (peer: (typeof peers)[number]) => {
      const prev = useRoomStore.getState().peers;
      setPeers([...prev, peer]);
    };
    const handlePeerLeft = ({ userId: peerId }: { userId: string }) => {
      const prev = useRoomStore.getState().peers;
      setPeers(prev.filter((peer) => peer.userId !== peerId));
    };
    const handleHandRaised = ({
      userId: peerId,
      raisedHand
    }: {
      userId: string;
      raisedHand: boolean;
    }) => {
      const prev = useRoomStore.getState().peers;
      setPeers(
        prev.map((peer) =>
          peer.userId === peerId ? { ...peer, raisedHand } : peer
        )
      );
    };
    const handleRtpCapabilities = ({ rtpCapabilities: nextRtp }: { rtpCapabilities: unknown }) => {
      setRtpCapabilities(nextRtp ?? null);
    };

    socket.on("room:roster", handleRoster);
    socket.on("room:peer-joined", handlePeerJoined);
    socket.on("room:peer-left", handlePeerLeft);
    socket.on("room:hand-raised", handleHandRaised);
    socket.on("room:rtp-capabilities", handleRtpCapabilities);

    return () => {
      socket.off("room:roster", handleRoster);
      socket.off("room:peer-joined", handlePeerJoined);
      socket.off("room:peer-left", handlePeerLeft);
      socket.off("room:hand-raised", handleHandRaised);
      socket.off("room:rtp-capabilities", handleRtpCapabilities);
      socket.disconnect();
    };
  }, [socket, setPeers, setRtpCapabilities, peers]);

  return (
    <main>
      <div className="container">
        <section className="hero">
          <div className="hero-card">
            <span className="badge">Live Classroom Platform</span>
            <h1 className="hero-title">Creator Studio</h1>
            <p className="hero-subtitle">
              Launch beautiful live classes powered by MediaSoup, real-time
              signaling, and a scalable service backbone. Create a room, invite
              speakers, and keep your community connected.
            </p>
            <div className="inline-list">
              <span className="pill">Instant rooms</span>
              <span className="pill">Role-based controls</span>
              <span className="pill">Recording pipeline</span>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="section-title">Account</h2>
              <span className="badge">{sessionData?.user ? "Signed in" : "Guest"}</span>
            </div>
            <p className="muted">
              {sessionData?.user
                ? `Welcome back, ${sessionData.user.name ?? sessionData.user.email}.`
                : "Sign in to sync your classrooms and access moderation tools."}
            </p>
            <div className="control-row" style={{ marginTop: "16px" }}>
              {sessionData?.user ? (
                <button type="button" className="ghost" onClick={() => signOut()}>
                  Sign out
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => signIn("github")}>
                  Sign in with GitHub
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid two">
          <div className="card">
            <div className="card-header">
              <h2 className="section-title">Start a new class</h2>
              <span className="pill">Host workflow</span>
            </div>
            <div className="control-group">
              <input
                type="text"
                placeholder="Class title"
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
              />
              <input
                type="text"
                placeholder="Short description"
                value={roomDescription}
                onChange={(event) => setRoomDescription(event.target.value)}
              />
              <div className="control-row">
                <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <button type="button" className="primary" onClick={createRoom}>
                Create & join room
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="section-title">Join an existing room</h2>
              <span className="pill">Viewer workflow</span>
            </div>
            <div className="control-group">
              <input
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
              />
              <div className="control-row">
                <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <button type="button" className="primary" onClick={joinRoom}>
                Join room
              </button>
            </div>
          </div>
        </section>

        <section className="grid two">
          <div className="card">
            <div className="card-header">
              <h2 className="section-title">Live room status</h2>
              <span className="pill">{room ? "Active" : "Idle"}</span>
            </div>
            {room ? (
              <div className="control-group">
                <div>
                  <p className="muted" style={{ marginBottom: "4px" }}>
                    {room.description ?? "No description"}
                  </p>
                  <strong>{room.title}</strong>
                  <div className="muted">Room ID: {room.id}</div>
                  <div className="muted">
                    Created {new Date(room.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="inline-list">
                  <span className="pill">Session: {session?.status ?? "none"}</span>
                  <span className="pill">Peers: {peers.length}</span>
                  <span className="pill">
                    Media router: {rtpCapabilities ? "ready" : "pending"}
                  </span>
                </div>
                <div className="control-row">
                  <button type="button" className="ghost" onClick={toggleHandRaise}>
                    {handRaised ? "Lower hand" : "Raise hand"}
                  </button>
                  <button type="button" className="warn" onClick={leaveRoom}>
                    Leave room
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted">Create or join a room to see live status.</p>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="section-title">Participants</h2>
              <span className="pill">{peers.length} online</span>
            </div>
            {peers.length ? (
              <div className="participants">
                {peers.map((peer) => (
                  <div key={`${peer.userId}-${peer.socketId}`} className="participant">
                    <div className="participant-info">
                      <span className="participant-name">{peer.displayName}</span>
                      <span className="participant-meta">
                        {peer.role} · joined {peer.joinedAt ? new Date(peer.joinedAt).toLocaleTimeString() : "now"}
                      </span>
                    </div>
                    <span className="pill">{peer.raisedHand ? "✋" : "●"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No peers yet. Invite someone to join.</p>
            )}
          </div>
        </section>

        <p className="footer-note">
          Services online: API, signaling, media worker, and background jobs.
          Recording and VOD services are ready for integration.
        </p>
      </div>
    </main>
  );
}
