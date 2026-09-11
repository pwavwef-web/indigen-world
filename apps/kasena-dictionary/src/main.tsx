import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans/wght.css";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Kasem Dictionary root element was not found.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
