"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferred, setDeferred] = useState<Event | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {});

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e);
      setCanInstall(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!canInstall || !deferred) return null;

  return (
    <button
      type="button"
      className="fixed bottom-4 right-4 z-[80] rounded-full border border-[color:rgba(232,165,75,0.45)] bg-[#121212]/95 px-4 py-2.5 text-sm font-semibold text-[color:var(--accent)] shadow-lg backdrop-blur"
      onClick={async () => {
        const ev = deferred as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: string }>;
        };
        await ev.prompt();
        const choice = await ev.userChoice;
        setCanInstall(false);
        setDeferred(null);
        if (choice.outcome === "accepted") {
          /* installed */
        }
      }}
    >
      Install OrzuAi
    </button>
  );
}
