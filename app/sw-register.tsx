"use client";

import { useEffect } from "react";

const basePath = process.env.NODE_ENV === "production" ? "/prompt-forge" : "";

export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
      .catch((err) => {
        console.error("Service worker registration failed:", err);
      });
  }, []);

  return null;
}
