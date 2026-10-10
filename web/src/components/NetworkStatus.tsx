"use client";

import { useEffect, useState } from "react";

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof window === "undefined" ? true : window.navigator.onLine,
  );
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    function handleOffline() {
      setIsOnline(false);
      setShowRestored(false);
    }

    function handleOnline() {
      setIsOnline(true);
      setShowRestored(true);
      const timeout = window.setTimeout(() => setShowRestored(false), 3500);
      return () => window.clearTimeout(timeout);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (isOnline && !showRestored) return null;

  return (
    <div
      className={`network-status ${isOnline ? "is-restored" : "is-offline"}`}
      role="status"
    >
      <span aria-hidden="true">{isOnline ? "✓" : "!"}</span>
      {isOnline
        ? "Connection restored"
        : "You are offline. Changes will sync when you reconnect."}
    </div>
  );
}
