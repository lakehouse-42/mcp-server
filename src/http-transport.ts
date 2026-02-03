/**
 * Streamable HTTP Transport for MCP Server.
 * Implements the 2025-06-18 MCP spec with session management and SSE streaming.
 */

import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { ToolExecutor } from "./tools.js";
import { TOOL_DEFINITIONS } from "./tools.js";

// =============================================================================
// Types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Session {
  id: string;
  createdAt: Date;
  lastEventId: number;
  pendingEvents: Array<{ id: number; data: JsonRpcResponse }>;
}

// =============================================================================
// Session Store
// =============================================================================

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function createSession(): Session {
  const session: Session = {
    id: randomUUID(),
    createdAt: new Date(),
    lastEventId: 0,
    pendingEvents: [],
  };
  sessions.set(session.id, session);
  return session;
}

function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (session) {
    // Check TTL
    if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
      return undefined;
    }
  }
  return session;
}

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 60000);

// =============================================================================
// HTTP Transport Handler
// =============================================================================

export interface HttpTransportOptions {
  toolExecutor: ToolExecutor;
  serverName?: string;
  serverVersion?: string;
}

export class HttpTransport {
  private readonly toolExecutor: ToolExecutor;
  private readonly serverName: string;
  private readonly serverVersion: string;

  constructor(options: HttpTransportOptions) {
    this.toolExecutor = options.toolExecutor;
    this.serverName = options.serverName || "lakehouse42";
    this.serverVersion = options.serverVersion || "0.1.0";
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Last-Event-ID");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route handling
    if (url.pathname === "/mcp" || url.pathname === "/") {
      if (req.method === "POST") {
        await this.handlePost(req, res);
      } else if (req.method === "GET") {
        await this.handleGet(req, res);
      } else if (req.method === "DELETE") {
        await this.handleDelete(req, res);
      } else {
        res.writeHead(405);
        res.end();
      }
    } else if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: this.serverName, version: this.serverVersion }));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let request: JsonRpcRequest;

    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Get or create session
    let sessionId = req.headers["mcp-session-id"] as string | undefined;
    let session: Session;

    if (sessionId) {
      const existing = getSession(sessionId);
      if (!existing) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      session = existing;
    } else {
      session = createSession();
      sessionId = session.id;
    }

    res.setHeader("Mcp-Session-Id", sessionId);

    // Process the request
    const response = await this.processRequest(request);

    // Check if client wants streaming (Accept: text/event-stream)
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("text/event-stream")) {
      // SSE streaming response
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const eventId = ++session.lastEventId;
      res.write(`id: ${eventId}\n`);
      res.write(`data: ${JSON.stringify(response)}\n\n`);
      res.end();
    } else {
      // Direct JSON response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    }
  }

  private async handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // SSE endpoint for receiving server-initiated messages
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const lastEventId = req.headers["last-event-id"] as string | undefined;

    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Mcp-Session-Id header required" }));
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Mcp-Session-Id": sessionId,
    });

    // Replay missed events if Last-Event-ID provided
    if (lastEventId) {
      const lastId = parseInt(lastEventId, 10);
      const missedEvents = session.pendingEvents.filter((e) => e.id > lastId);
      for (const event of missedEvents) {
        res.write(`id: ${event.id}\n`);
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      }
    }

    // Keep connection open (client can close)
    req.on("close", () => {
      res.end();
    });
  }

  private async handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
      sessions.delete(sessionId);
    }

    res.writeHead(204);
    res.end();
  }

  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case "initialize":
          result = {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: this.serverName, version: this.serverVersion },
          };
          break;

        case "tools/list":
          result = { tools: TOOL_DEFINITIONS };
          break;

        case "tools/call":
          if (!params?.name) {
            throw new Error("Tool name required");
          }
          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await this.toolExecutor.execute(
                    params.name as string,
                    (params.arguments as Record<string, unknown>) || {}
                  )
                ),
              },
            ],
          };
          break;

        case "ping":
          result = {};
          break;

        default:
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
      }

      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}

// =============================================================================
// Express/Fastify Middleware Helper
// =============================================================================

export function createHttpHandler(options: HttpTransportOptions) {
  const transport = new HttpTransport(options);

  return async (req: IncomingMessage, res: ServerResponse) => {
    await transport.handleRequest(req, res);
  };
}
