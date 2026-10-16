import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./query-client";
import "./styles.css";

async function start() {
  if (import.meta.env.VITE_MOCK_API !== "false") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }

  // Load socket.io-client after MSW has installed its WebSocket interceptor.
  const { router } = await import("./router");
  if (import.meta.env.VITE_MOCK_API !== "false") (await import("./mocks/test-hooks")).installTestHooks();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void start();
