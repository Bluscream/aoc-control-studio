import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashHistory } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { getRouter } from "./router";
import "./i18n";
import "./styles.css";

// Encaminha logs e erros do frontend para o terminal / aoc_debug.log do Tauri
function sendToRustLog(level: string, args: unknown[]) {
  try {
    const text = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    invoke("frontend_log", { level, message: text }).catch(() => {});
  } catch {}
}

const origLog = console.log;
const origInfo = console.info;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args) => {
  origLog(...args);
  sendToRustLog("LOG", args);
};
console.info = (...args) => {
  origInfo(...args);
  sendToRustLog("INFO", args);
};
console.warn = (...args) => {
  origWarn(...args);
  sendToRustLog("WARN", args);
};
console.error = (...args) => {
  origError(...args);
  sendToRustLog("ERROR", args);
};

window.addEventListener("error", (e) => {
  sendToRustLog("UNCAUGHT_ERR", [`${e.message} em ${e.filename}:${e.lineno}:${e.colno}`]);
});

window.addEventListener("unhandledrejection", (e) => {
  sendToRustLog("UNHANDLED_REJECTION", [String(e.reason)]);
});

const router = getRouter();
const hashHistory = createHashHistory();
router.update({ history: hashHistory, context: router.options.context });

router.history.subscribe((location) => {
  sendToRustLog("NAV", [`Navegou para: ${location.location.pathname}${location.location.searchStr || ""}`]);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
