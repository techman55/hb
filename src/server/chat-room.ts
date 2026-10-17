import { DurableObject } from "cloudflare:workers";

/**
 * One instance per rental thread. Holds the open WebSockets (hibernatable, so idle threads cost
 * nothing) and fans out new messages. Messages themselves are stored in D1 by the app.
 */
export class ChatRoom extends DurableObject<CloudflareEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    const userId = request.headers.get("x-dibs-user") ?? "anon";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [userId]);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Called over RPC by the app after a message is saved. */
  async broadcast(payload: string): Promise<number> {
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
        sent++;
      } catch {
        /* socket already closing */
      }
    }
    return sent;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 200) return;
    if (message === "typing") {
      const [userId] = this.ctx.getTags(ws);
      const payload = JSON.stringify({ type: "typing", userId });
      for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(payload);
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    ws.close(code === 1005 ? 1000 : code, "closing");
  }
}
