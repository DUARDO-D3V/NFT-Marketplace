import { marketSocket } from "../realtime";

// Lets E2E tests emit through the real socket.io client, never around it.
export function installTestHooks() {
  (window as unknown as { __kurioSocket?: typeof marketSocket }).__kurioSocket = marketSocket;
}