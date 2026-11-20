"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallNavigator = Navigator & {
  install?: () => Promise<unknown>;
  getInstalledRelatedApps?: () => Promise<{ platform: string }[]>;
};

declare global {
  interface Window {
    schoolPortalInstallOffer?: InstallEvent;
  }
}

function subscribeToDisplayMode(update: () => void) {
  const display = window.matchMedia("(display-mode: standalone)");
  display.addEventListener("change", update);
  return () => display.removeEventListener("change", update);
}

function environment() {
  if (!window.isSecureContext) return "insecure";
  if (window.matchMedia("(display-mode: standalone)").matches)
    return "installed";
  return "browser";
}

export function PortalInstall({ checking }: { checking: boolean }) {
  const context = useSyncExternalStore(
    subscribeToDisplayMode,
    environment,
    () => "loading",
  );
  const [offer, setOffer] = useState<InstallEvent | null>(null);

  const [direct, setDirect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const [received, setReceived] = useState(false);

  useEffect(() => {
    if (
      !window.isSecureContext ||
      window.matchMedia("(display-mode: standalone)").matches
    )
      return;
    let active = true;
    const nav: InstallNavigator = navigator;
    if (typeof nav.install === "function") {
      void (async () => {
        try {
          const apps = await nav.getInstalledRelatedApps?.();
          if (!active) return;
          if (apps?.some((app) => app.platform === "webapp")) {
            setClosed(true);
          } else {
            setDirect(true);
          }
        } catch {
          // When installed-state detection fails, rely on the browser offer.
        }
      })();
    }
    const onOffer = (event: Event) => {
      const installEvent = event as InstallEvent;
      if (typeof installEvent.prompt !== "function") return;
      event.preventDefault();
      delete window.schoolPortalInstallOffer;
      setReceived(true);
      setOffer(installEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    if (window.schoolPortalInstallOffer)
      onOffer(window.schoolPortalInstallOffer);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setOffer(null);
    setClosed(true);
  }

  async function install() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (offer) {
        setOffer(null);
        await offer.prompt();
        await offer.userChoice;
      } else if (direct) {
        await (navigator as InstallNavigator).install!();
      } else return;
      dismiss();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError")
        dismiss();
      else
        setError("The browser could not start installation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const status =
    context === "loading"
      ? "Sign-in page loaded. Waiting for the browser script."
      : context === "insecure"
        ? "This page is outside a secure browser context."
        : context === "installed"
          ? "This page is running as an installed app."
          : closed
            ? "The prompt was dismissed or installation finished."
            : offer
              ? "The browser supplied an install offer. Install app is ready."
              : direct
                ? "This browser supports installation directly from this page."
                : received
                  ? "The browser offer has been used."
                  : "The sign-in page is listening. This tab has not delivered a native install offer.";

  return (
    <>
      <output
        id="install-check"
        className={`${checking ? "block" : "hidden target:block"} bg-panel p-3 text-sm text-ink`}
        aria-live="polite"
      >
        <strong>Portal install check</strong> &middot; {status}
      </output>
      {context === "browser" && !closed && (offer || direct || busy) && (
        <section
          role="dialog"
          aria-labelledby="portal-install-title"
          aria-describedby="portal-install-description"
          onKeyDown={(event) => {
            if (event.key === "Escape") dismiss();
          }}
          className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 space-y-3 [@media(display-mode:standalone)]:hidden rounded-xl border border-line bg-panel p-4 text-sm text-ink shadow-lg print:hidden sm:inset-x-auto sm:right-5 sm:max-w-sm"
        >
          <h2 id="portal-install-title" className="font-bold">
            Install the Pathivara School Portal
          </h2>
          <p id="portal-install-description" className="leading-relaxed">
            Add the portal to your home screen or desktop for quick access.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-2"
              onClick={dismiss}
            >
              Not now
            </button>
            <button
              type="button"
              className="rounded-md bg-teal px-3 py-2 font-semibold text-white"
              disabled={busy}
              onClick={() => void install()}
            >
              Install app
            </button>
          </div>
        </section>
      )}
    </>
  );
}
