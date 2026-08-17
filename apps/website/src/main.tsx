/**
 * src/main.tsx
 *
 * Entry point. Wraps <App> in <RouterProvider> and <StrictMode>, and
 * loads the self-hosted Noto Sans variable font before site styles.
 * Firebase analytics is loaded lazily by src/lib/analytics.ts only when
 * the reviewed build-time environment enables it.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RouterProvider } from "./app/router";
import "@fontsource-variable/noto-sans/wght.css";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider>
      <App />
    </RouterProvider>
  </StrictMode>
);
