import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FD_ICON_HREF } from "./components/BrandMark";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SERVER_MODE } from "./lib/api";
import { BRAND } from "./lib/brand";
import { StoreProvider } from "./lib/store";
import { ServerGate } from "./pages/Auth";
import "./index.css";

// Haqiqiy tizimda brauzer yorlig'ida agentlik nomi va logotipi
if (SERVER_MODE) {
  document.title = BRAND;
  document.querySelector<HTMLLinkElement>("link[rel=icon]")?.setAttribute("href", FD_ICON_HREF);
  document.querySelector<HTMLLinkElement>("link[rel=apple-touch-icon]")?.setAttribute("href", "fd-touch-icon.png");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {SERVER_MODE ? (
        <ServerGate />
      ) : (
        <StoreProvider>
          <App />
        </StoreProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
