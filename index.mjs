/**
 * Neon Functions entry point.
 * Exports { fetch } using Web Standard Request/Response APIs.
 * Wraps the existing Poly-Glot MCP server with WebStandardStreamableHTTPServerTransport.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPolyglotServer, templates, MCP_PATH } from "./server.js";
import { languagePublicList } from "./localization.js";
import { publicPricing } from "./pricing.js";
import { recordError } from "./analytics-expansion.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS" && url.pathname === MCP_PATH) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health / info endpoint
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        name: "Poly-Glot AI Workspace MCP",
        status: "ok",
        endpoint: MCP_PATH,
        templates: templates.length,
        freeTemplates: templates.filter((t) => t.plan === "free").length,
        supportedLanguages: languagePublicList().length,
        pricing: publicPricing(),
      });
    }

    // MCP endpoint
    if (url.pathname === MCP_PATH && ["POST", "GET", "DELETE"].includes(request.method)) {
      try {
        const authHeader = String(request.headers.get("authorization") || "");
        const requestAuthToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const server = createPolyglotServer(requestAuthToken);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        // Inject CORS headers into the response
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        console.error("MCP request failed", error);
        recordError({
          toolName: "mcp_transport",
          errorType: error?.message || String(error),
          clientName: "unknown",
          userKey: null,
          sessionKey: null,
          metadata: {},
        });
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
