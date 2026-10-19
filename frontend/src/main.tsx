import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element in index.html.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Lets the app open without a connection once visited (only in the published build).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline use is a convenience; the app works without it.
    });
  });
}
