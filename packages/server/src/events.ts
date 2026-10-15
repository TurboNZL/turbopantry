import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Live updates: every signed-in device keeps one GET /api/events stream open, and each change anywhere sends a small "something changed" event
 * (which topic, who). Devices then reload that topic. It is plain Server-Sent Events, which a Cloudflare Tunnel passes through; a comment line
 * every 25 s keeps the tunnel from closing an idle stream (it drops them after about 100 s).
 */
export type Topic = 'items' | 'list' | 'recipes';

export class Hub {
  private clients = new Set<ServerResponse>();
  private timer: ReturnType<typeof setInterval> | null = null;

  get size() { return this.clients.size; }

  join(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n: connected\n\n');
    this.clients.add(res);
    if (!this.timer) { this.timer = setInterval(() => { for (const c of this.clients) c.write(': keep-alive\n\n'); }, 25_000); this.timer.unref(); }
    req.on('close', () => { this.clients.delete(res); if (!this.clients.size && this.timer) { clearInterval(this.timer); this.timer = null; } });
  }

  send(topic: Topic, by: string) {
    const frame = `event: ${topic}\ndata: ${JSON.stringify({ by, at: Date.now() })}\n\n`;
    for (const c of this.clients) c.write(frame);
  }

  /** Ends every open stream (server shutdown, tests). */
  closeAll() {
    for (const c of this.clients) c.end();
    this.clients.clear();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
