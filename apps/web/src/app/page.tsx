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
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-white px-6 pb-16 pt-12 text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="glass-panel px-8 py-10">
            <span className="label">Live classroom platform</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
              Creator Studio
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-muted">
              Deliver live classes with a calm, modern command center. Create rooms,
              invite speakers, and keep your production flow in sync with MediaSoup
              routing and real-time signaling.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="pill">Instant rooms</span>
              <span className="pill">Role-based controls</span>
              <span className="pill">Recording-ready</span>
            </div>
          </div>

          <div className="card flex flex-col gap-5 p-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="label">Account</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  {sessionData?.user ? "Signed in" : "Guest access"}
                </h2>
              </div>
              <span className="pill">
                {sessionData?.user ? "Authenticated" : "Demo mode"}
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              {sessionData?.user
                ? `Welcome back, ${sessionData.user.name ?? sessionData.user.email}.`
                : "Sign in to sync your classrooms, save rooms, and unlock moderation tools."}
            </p>
            {sessionData?.user ? (
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
                onClick={() => signOut()}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700"
                onClick={() => signIn("github")}
              >
                Sign in with GitHub
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="label">Host</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Start a new class
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Create a room, assign a role, and open the live session.
                </p>
              </div>
              <span className="pill">Ready to broadcast</span>
            </div>
            <div className="mt-6 space-y-4">
              <input
                className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                type="text"
                placeholder="Class title"
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                type="text"
                placeholder="Short description"
                value={roomDescription}
                onChange={(event) => setRoomDescription(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700"
                onClick={createRoom}
              >
                Create & join room
              </button>
            </div>
          </div>

          <div className="card p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="label">Join</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Join an existing room
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Enter a room ID and pick your role to jump in.
                </p>
              </div>
              <span className="pill">Viewer workflow</span>
            </div>
            <div className="mt-6 space-y-4">
              <input
                className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-surface-muted px-4 py-3 text-sm"
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={joinRoom}
              >
                Join room
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card p-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="label">Live status</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Room control center
                </h2>
              </div>
              <span className="pill">{room ? "Active" : "Idle"}</span>
            </div>
            {room ? (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm text-ink-muted">
                    {room.description ?? "No description"}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {room.title}
                  </h3>
                  <div className="mt-1 text-sm text-ink-muted">Room ID: {room.id}</div>
                  <div className="text-sm text-ink-muted">
                    Created {new Date(room.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="pill">Session: {session?.status ?? "none"}</span>
                  <span className="pill">Peers: {peers.length}</span>
                  <span className="pill">
                    Media router: {rtpCapabilities ? "ready" : "pending"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300"
                    onClick={toggleHandRaise}
                  >
                    {handRaised ? "Lower hand" : "Raise hand"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-100"
                    onClick={leaveRoom}
                  >
                    Leave room
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-muted">
                Create or join a room to activate room controls.
              </p>
            )}
          </div>

          <div className="card p-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="label">Participants</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Live roster
                </h2>
              </div>
              <span className="pill">{peers.length} online</span>
            </div>
            <div className="mt-6 space-y-3">
              {peers.length ? (
                peers.map((peer) => (
                  <div
                    key={`${peer.userId}-${peer.socketId}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-surface-muted px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {peer.displayName}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {peer.role} · joined {peer.joinedAt ? new Date(peer.joinedAt).toLocaleTimeString() : "now"}
                      </div>
                    </div>
                    <span className="pill">{peer.raisedHand ? "✋" : "●"}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-muted">
                  No peers yet. Invite someone to join.
                </p>
              )}
            </div>
          </div>
        </section>

        <footer className="rounded-2xl border border-slate-200 bg-white/60 px-6 py-4 text-center text-xs text-ink-muted shadow-sm">
          Services online: API, signaling, media worker, and background jobs. Recording
          and VOD services are ready for integration.
        </footer>
      </div>
    </main>
  );
}
