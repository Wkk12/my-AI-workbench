"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, X } from "lucide-react";

export default function TunnelBanner() {
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isHttp = typeof window !== "undefined" && window.location.protocol === "http:";
    const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
    // Only show on HTTP non-localhost
    if (!isHttp || isLocalhost) return;

    fetch("/api/tunnel")
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setTunnelUrl(d.url);
      })
      .catch(() => {});
  }, []);

  if (!tunnelUrl || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 text-sm">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>通知功能需 HTTPS：</span>
        <a
          href={tunnelUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2 inline-flex items-center gap-1 hover:text-amber-900 dark:hover:text-amber-300"
        >
          {tunnelUrl}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-amber-500/20 rounded text-amber-600"
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
