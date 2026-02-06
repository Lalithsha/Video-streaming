"use client";

import { create } from "zustand";

type Room = {
  id: string;
  title: string;
  createdAt: string;
};

type Peer = {
  userId: string;
  socketId: string;
};

type RoomState = {
  room: Room | null;
  peers: Peer[];
  setRoom: (room: Room | null) => void;
  setPeers: (peers: Peer[]) => void;
  reset: () => void;
};

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  peers: [],
  setRoom: (room) => set({ room }),
  setPeers: (peers) => set({ peers }),
  reset: () => set({ room: null, peers: [] })
}));
