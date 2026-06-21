/**
 * Stateless Streamable HTTP transport — for remote / shared deployment.
 *
 * Uses the SDK's WebStandard variant (standard Request → Response) which
 * pairs natively with Bun.serve. Stateless mode (sessionIdGenerator:
 * undefined) means no session tracking — every request is handled
 * independently, which is ideal for "simple API-style servers" per the
 * SDK docs and lets any number of clients hit the same endpoint without
 * session-eviction concerns.
 *
 * This is the single-binary equivalent of what PRTS-MCP's ts/ achieves
 * with express + session state. We skip session state on purpose: the
 * Endfield MCP has no per-session state (no cursors, no partial sync),
 * so stateless is strictly simpler with no capability loss.
 *
 * Endpoints:
 *   POST /mcp    — MCP JSON-RPC over Streamable HTTP
 *   GET  /mcp    — SSE stream (stateless mode returns 405; clients use POST)
 *   GET  /health — liveness probe
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLogger } from "../utils/log.js";

export interface HttpOptions {
  port: number;
  host: string;
}

const log = createLogger("ef.http");

/**
 * Build a fresh transport+server pair for one request.
 *
 * In stateless mode the SDK does not retain anything between requests, so
 * we create a new transport per inbound POST. The McpServer instance is
 * also created per-request: tool registration is cheap (pure schema
 * attachment, no I/O), and per-request isolation guarantees no shared
 * mutable state across callers.
 */
function createServerFactory(
  serverFactory: () => McpServer,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    const server = serverFactory();
    try {
      await server.connect(transport);
      return await transport.handleRequest(req);
    } catch (err) {
      log(
        "ERROR",
        `Request handling failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
          },
          id: null,
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  };
}

export async function runHttp(
  serverFactory: () => McpServer,
  opts: HttpOptions,
): Promise<void> {
  const handler = createServerFactory(serverFactory);

  // Pre-bind a reusable health-check Response.
  const healthResponse = () =>
    new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json" },
    });

  const routingServer = Bun.serve({
    port: opts.port,
    hostname: opts.host,
    fetch(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return healthResponse();
      }

      if (url.pathname === "/mcp") {
        // Stateless transport only supports POST. GET (SSE) would require
        // session state we explicitly don't keep.
        if (req.method !== "POST") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: `Method ${req.method} not supported on /mcp in stateless mode. Use POST.`,
              },
              id: null,
            }),
            {
              status: 405,
              headers: {
                "content-type": "application/json",
                allow: "POST",
              },
            },
          );
        }
        return Promise.resolve(handler(req));
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  log(
    "INFO",
    `HTTP transport listening on ${routingServer.hostname}:${routingServer.port} (/mcp, /health)`,
  );
}
