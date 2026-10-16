import { io } from "socket.io-client";

export const marketSocket = io(import.meta.env.VITE_SOCKET_URL ?? window.location.origin, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 5_000,
  ...(import.meta.env.VITE_MOCK_API === "false"
    ? {}
    : { transports: ["websocket" as const] }),
});

export interface NftUpdatedEvent {
  id: string;
  price: string;
  available?: number;
  version: number;
  updatedAt: string;
}
