"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const POLL_MS = 8000;

/**
 * Keeps the inbox, badges and lending lists current. The server pings `/ws/me` when anything
 * changes for this user and we re-fetch the page's server data. Without a socket (local dev, a
 * dropped connection) the inbox falls back to polling.
 */
export function LiveUpdates() {
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    let debounce: ReturnType<typeof setTimeout>;
    let failures = 0;

    const refresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => router.refresh(), 300);
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws/me`);
      ws.onopen = () => {
        // Catch up on anything that happened while we were disconnected.
        if (failures > 0) refresh();
        failures = 0;
      };
      ws.onmessage = (e) => {
        if (e.data !== "pong") refresh();
      };
      ws.onclose = () => {
        if (closed) return;
        failures++;
        retry = setTimeout(connect, Math.min(30_000, 2000 * failures));
      };
    };
    connect();

    const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
    const poll = setInterval(() => {
      if (ws?.readyState !== WebSocket.OPEN && path.current === "/inbox" && document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      closed = true;
      clearTimeout(retry);
      clearTimeout(debounce);
      clearInterval(ping);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
  }, [router]);

  return null;
}
