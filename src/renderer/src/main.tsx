/**
 * File: main.tsx
 * Path: src/renderer/src/main.tsx
 * Description: React entry — mounts App into #root with StrictMode.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./routes/App";
import SymbolsWindow from "./features/symbols/components/SymbolsWindow";
import "@fontsource-variable/inter";
import "./styles.css";

// The Symbols and phrases window loads this same bundle with ?window=symbols and shows only its own content.
const isSymbolsWindow = new URLSearchParams(window.location.search).get("window") === "symbols";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isSymbolsWindow ? <SymbolsWindow /> : <App />}</React.StrictMode>,
);