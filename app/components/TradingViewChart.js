"use client";

import { useEffect, useId, useRef } from "react";

let scriptPromise = null;

function loadTradingViewScript() {
  if (typeof window !== "undefined" && window.TradingView) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

export default function TradingViewChart({ symbol, height = 480 }) {
  const containerId = `tv-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const isDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;

    loadTradingViewScript().then(() => {
      if (cancelled || !container || !window.TradingView) return;
      container.innerHTML = "";
      new window.TradingView.widget({
        autosize: true,
        symbol: `PSX:${symbol}`,
        interval: "D",
        timezone: "Etc/UTC",
        theme: isDark ? "dark" : "light",
        style: "1",
        locale: "en",
        enable_publishing: false,
        allow_symbol_change: false,
        hide_side_toolbar: false,
        studies: ["RSI@tv-basicstudies"],
        container_id: containerId,
      });
    });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [symbol, containerId]);

  return (
    <div className="w-full" style={{ height }}>
      <div id={containerId} ref={containerRef} className="w-full h-full" />
    </div>
  );
}
