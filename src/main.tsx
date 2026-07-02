/**
 * File: main.tsx
 * Path: src/main.tsx
 * Description: React entry — mounts App into #root with StrictMode.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);