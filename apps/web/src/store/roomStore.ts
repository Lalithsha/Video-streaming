"use client";

import { create } from "zustand";

type Room = {
  id: string;
  title: string;
  createdAt: string;
  description?: string;
};

type Session = {
  id: string;
  roomId: string;
  status: "scheduled" | "live" | "ended";
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
};

type Peer = {
  userId: string;
  socketId: string;
  displayName: string;
  role: "host" | "cohost" | "speaker" | "viewer";
  raisedHand: boolean;
  joinedAt?: string;
};

type RoomState = {
  room: Room | null;
  session: Session | null;
  peers: Peer[];
  rtpCapabilities: unknown | null;
  setRoom: (room: Room | null) => void;
  setSession: (session: Session | null) => void;
  setPeers: (peers: Peer[]) => void;
  setRtpCapabilities: (capabilities: unknown | null) => void;
  reset: () => void;
};

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  session: null,
  peers: [],
  rtpCapabilities: null,
  setRoom: (room) => set({ room }),
  setSession: (session) => set({ session }),
  setPeers: (peers) => set({ peers }),
  setRtpCapabilities: (rtpCapabilities) => set({ rtpCapabilities }),
  reset: () => set({ room: null, session: null, peers: [], rtpCapabilities: null })
}));
