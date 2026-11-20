"use client";

import { useEffect } from "react";

export function PortalWorker() {
  useEffect(() => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    for (const scope of ["/auth", "/dashboard"]) {
      void navigator.serviceWorker.register("/portal-sw.js", {
        scope,
        updateViaCache: "none",
      }).catch(() => {
        // Sign-in and dashboard navigation also work without a worker.
      });
    }
  }, []);
  return null;
}
