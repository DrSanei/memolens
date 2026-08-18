import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemolensApp } from "./App";
import "./styles/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("Memolens root element was not found.");

createRoot(root).render(
  <StrictMode>
    <MemolensApp />
  </StrictMode>,
);
