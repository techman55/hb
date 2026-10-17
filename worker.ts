// Custom Worker entry. OpenNext handles every Next.js request; this file adds the pieces Next
// can't own on Workers: the chat WebSocket upgrade, the cron handler and our Durable Object.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the file only exists after `opennextjs-cloudflare build`
// @ts-ignore: generated at build time
import { default as openNext } from "./.open-next/worker.js";
import { handleChatSocket } from "./src/server/ws";
import { runScheduled } from "./src/server/cron";

export { ChatRoom } from "./src/server/chat-room";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/chat/")) return handleChatSocket(request, env);
    return openNext.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<CloudflareEnv>;
