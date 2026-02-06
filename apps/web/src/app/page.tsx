"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Device,
  type Consumer,
  type Producer,
  type RtpCapabilities,
  type Transport
} from "mediasoup-client";
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

type ProducerSummary = {
  id: string;
  userId: string;
  kind: string;
};

type RemoteStream = {
  id: string;
  userId: string;
  kind: string;
  stream: MediaStream;
};

const fetchApi = (input: RequestInfo, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "include" });

export default function HomePage() {
  const { data: sessionData } = useSession();
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [roomId, setRoomId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("host");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);

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

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const producersRef = useRef<Map<string, Producer>>(new Map());
  const consumersRef = useRef<Map<string, Consumer>>(new Map());

  const userId = useMemo(
    () => sessionData?.user?.email ?? sessionData?.user?.name ?? "guest",
    [sessionData]
  );

  const resolvedDisplayName = displayName || sessionData?.user?.name || userId;

  const ensureDevice = useCallback(async () => {
    if (deviceRef.current || !rtpCapabilities) return deviceRef.current;
    const device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities as RtpCapabilities });
    deviceRef.current = device;
    return device;
  }, [deviceRef, rtpCapabilities]);

  const createTransport = useCallback(
    async (direction: "send" | "recv") => {
      if (!socket || !roomId) return null;
      return new Promise<{
        id: string;
        iceParameters: unknown;
        iceCandidates: unknown;
        dtlsParameters: unknown;
      } | null>((resolve) => {
        socket.emit(
          "mediasoup:create-transport",
          { roomId, direction },
          (response: { ok: boolean; transportOptions?: any }) => {
            if (!response?.ok || !response.transportOptions) {
              resolve(null);
              return;
            }
            resolve(response.transportOptions);
          }
        );
      });
    },
    [roomId, socket]
  );

  const setupSendTransport = useCallback(
    async (device: Device) => {
      if (sendTransportRef.current) return sendTransportRef.current;
      const transportOptions = await createTransport("send");
      if (!transportOptions) return null;
      const transport = device.createSendTransport(transportOptions);
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        socket?.emit(
          "mediasoup:connect-transport",
          { roomId, transportId: transport.id, dtlsParameters },
          (response: { ok: boolean; error?: string }) => {
            if (response?.ok) {
              callback();
            } else {
              errback(new Error(response?.error ?? "Transport connect failed"));
            }
          }
        );
      });
      transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        socket?.emit(
          "mediasoup:produce",
          { roomId, transportId: transport.id, kind, rtpParameters },
          (response: { ok: boolean; producerId?: string; error?: string }) => {
            if (response?.ok && response.producerId) {
              callback({ id: response.producerId });
            } else {
              errback(new Error(response?.error ?? "Produce failed"));
            }
          }
        );
      });
      sendTransportRef.current = transport;
      return transport;
    },
    [createTransport, roomId, sendTransportRef, socket]
  );

  const setupRecvTransport = useCallback(
    async (device: Device) => {
      if (recvTransportRef.current) return recvTransportRef.current;
      const transportOptions = await createTransport("recv");
      if (!transportOptions) return null;
      const transport = device.createRecvTransport(transportOptions);
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        socket?.emit(
          "mediasoup:connect-transport",
          { roomId, transportId: transport.id, dtlsParameters },
          (response: { ok: boolean; error?: string }) => {
            if (response?.ok) {
              callback();
            } else {
              errback(new Error(response?.error ?? "Transport connect failed"));
            }
          }
        );
      });
      recvTransportRef.current = transport;
      return transport;
    },
    [createTransport, roomId, recvTransportRef, socket]
  );

  const startLocalMedia = useCallback(async () => {
    if (!socket || !roomId) return;
    if (localStream) return;
    const device = await ensureDevice();
    if (!device) return;
    const sendTransport = await setupSendTransport(device);
    if (!sendTransport) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    setLocalStream(stream);
    for (const track of stream.getTracks()) {
      const producer = await sendTransport.produce({ track });
      producersRef.current.set(producer.id, producer);
    }
  }, [ensureDevice, localStream, producersRef, roomId, setupSendTransport, socket]);

  const consumeProducer = useCallback(
    async (producer: ProducerSummary) => {
      if (!socket || !roomId) return;
      if (consumersRef.current.has(producer.id)) return;
      const device = await ensureDevice();
      if (!device) return;
      const recvTransport = await setupRecvTransport(device);
      if (!recvTransport) return;
      socket.emit(
        "mediasoup:consume",
        {
          roomId,
          transportId: recvTransport.id,
          producerId: producer.id,
          rtpCapabilities: device.rtpCapabilities
        },
        async (response: { ok: boolean; consumerOptions?: any }) => {
          if (!response?.ok || !response.consumerOptions) return;
          const { id, producerId, kind, rtpParameters } = response.consumerOptions;
          const consumer = await recvTransport.consume({
            id,
            producerId,
            kind,
            rtpParameters
          });
          consumersRef.current.set(producer.id, consumer);
          const stream = new MediaStream([consumer.track]);
          setRemoteStreams((prev) => [
            ...prev.filter((item) => item.id !== producer.id),
            { id: producer.id, userId: producer.userId, kind: consumer.kind, stream }
          ]);
        }
      );
    },
    [consumersRef, ensureDevice, roomId, setupRecvTransport, socket]
  );

  const fetchRoomSessions = useCallback(async (targetRoomId: string) => {
    const response = await fetchApi(`${apiUrl}/rooms/${targetRoomId}/sessions`);
    if (!response.ok) return null;
    const data = (await response.json()) as { sessions: ApiSession[] };
    if (!data.sessions.length) return null;
    return data.sessions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, []);

  const connectSocket = useCallback(
    (targetRoomId: string) => {
      const client = io(signalingUrl, { transports: ["websocket"], withCredentials: true });
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
    const response = await fetchApi(`${apiUrl}/rooms`, {
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

    const sessionResponse = await fetchApi(`${apiUrl}/rooms/${data.id}/sessions`, {
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
    const response = await fetchApi(`${apiUrl}/rooms/${roomId}`);
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
    consumersRef.current.forEach((consumer) => consumer.close());
    producersRef.current.forEach((producer) => producer.close());
    consumersRef.current.clear();
    producersRef.current.clear();
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setRemoteStreams([]);
    setHandRaised(false);
    reset();
  }, [localStream, reset, roomId, socket, userId]);

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
      rtpCapabilities: nextRtpCapabilities,
      producers
    }: {
      peers: typeof peers;
      rtpCapabilities: unknown | null;
      producers: ProducerSummary[];
    }) => {
      setPeers(nextPeers);
      setRtpCapabilities(nextRtpCapabilities);
      if (producers?.length) {
        producers.forEach((producer) => {
          void consumeProducer(producer);
        });
      }
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
    const handleProducerAdded = (producer: ProducerSummary) => {
      void consumeProducer(producer);
    };
    const handleProducerRemoved = ({ producerId }: { producerId: string }) => {
      const consumer = consumersRef.current.get(producerId);
      if (consumer) {
        consumer.close();
        consumersRef.current.delete(producerId);
        setRemoteStreams((prev) => prev.filter((item) => item.id !== producerId));
      }
    };

    socket.on("room:roster", handleRoster);
    socket.on("room:peer-joined", handlePeerJoined);
    socket.on("room:peer-left", handlePeerLeft);
    socket.on("room:hand-raised", handleHandRaised);
    socket.on("room:rtp-capabilities", handleRtpCapabilities);
    socket.on("room:producer-added", handleProducerAdded);
    socket.on("room:producer-removed", handleProducerRemoved);

    return () => {
      socket.off("room:roster", handleRoster);
      socket.off("room:peer-joined", handlePeerJoined);
      socket.off("room:peer-left", handlePeerLeft);
      socket.off("room:hand-raised", handleHandRaised);
      socket.off("room:rtp-capabilities", handleRtpCapabilities);
      socket.off("room:producer-added", handleProducerAdded);
      socket.off("room:producer-removed", handleProducerRemoved);
      socket.disconnect();
    };
  }, [consumeProducer, consumersRef, setPeers, setRtpCapabilities, socket]);

  useEffect(() => {
    if (!socket || !room || !rtpCapabilities) return;
    void startLocalMedia();
  }, [room, rtpCapabilities, socket, startLocalMedia]);

  const bindStream = useCallback(
    (stream: MediaStream | null) => (node: HTMLVideoElement | HTMLAudioElement | null) => {
      if (!node || !stream) return;
      if (node.srcObject !== stream) {
        node.srcObject = stream;
      }
    },
    []
  );

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

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card p-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="label">Local preview</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">Your camera</h2>
              </div>
              <span className="pill">{localStream ? "Live" : "Idle"}</span>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-black">
              {localStream ? (
                <video
                  ref={bindStream(localStream) as (node: HTMLVideoElement | null) => void}
                  autoPlay
                  playsInline
                  muted
                  className="h-64 w-full object-cover"
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-white/70">
                  Start a room to preview your stream.
                </div>
              )}
            </div>
          </div>

          <div className="card p-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="label">Remote feeds</span>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">Classroom stage</h2>
              </div>
              <span className="pill">{remoteStreams.length} streams</span>
            </div>
            <div className="mt-6 grid gap-4">
              {remoteStreams.length ? (
                remoteStreams.map((remote) => (
                  <div
                    key={remote.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-black"
                  >
                    {remote.kind === "audio" ? (
                      <div className="flex h-32 items-center justify-center text-sm text-white/70">
                        {remote.userId} (audio)
                        <audio
                          ref={bindStream(remote.stream) as (node: HTMLAudioElement | null) => void}
                          autoPlay
                        />
                      </div>
                    ) : (
                      <video
                        ref={bindStream(remote.stream) as (node: HTMLVideoElement | null) => void}
                        autoPlay
                        playsInline
                        className="h-32 w-full object-cover"
                      />
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-muted">
                  Remote streams will appear when peers publish.
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
