import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SERVER_MODE } from "./lib/api";
import { StoreProvider } from "./lib/store";
import { ServerGate } from "./pages/Auth";
import "./index.css";

// Inter shrifti sahifa chizilgandan keyin ulanadi (bloklamaydi)
const font = document.createElement("link");
font.rel = "stylesheet";
font.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
document.head.appendChild(font);

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
