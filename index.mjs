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

// ── Rate limiter (simple in-memory, per IP) ──────────────────────
const rateLimits = new Map();
const RATE_LIMIT = 20; // requests per hour
const RATE_WINDOW = 3600000; // 1 hour in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimits.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Markdown Format Handler ──────────────────────────────────────
async function handleMarkdownFormat(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown";
  
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Rate limit exceeded. Maximum 20 requests per hour." },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return Response.json(
      { error: "AI formatting not configured on server." },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const { content, options } = body;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return Response.json({ error: "Missing or empty content" }, { status: 400, headers: CORS_HEADERS });
  }
  if (content.length > 50000) {
    return Response.json({ error: "Content too large. Maximum 50,000 characters." }, { status: 400, headers: CORS_HEADERS });
  }

  const opts = options || {};
  const goals = [];
  if (opts.frontmatter !== false) goals.push("- Add or enrich YAML frontmatter: title, description, tags, keywords, author, date, last_reviewed (today), expires (90 days from today), source, version");
  if (opts.structure !== false)   goals.push("- Enforce clear heading hierarchy: single H1, logical H2/H3 progression. Fix heading jumps.");
  if (opts.semantic !== false)    goals.push("- Rewrite vague or ambiguous sentences for clarity. Convert run-on text into structured paragraphs.");
  if (opts.geo !== false)         goals.push("- Bold the 3-5 most important keyword phrases per section using **keyword** syntax for AI search citation.");
  if (opts.rag !== false)         goals.push("- Add `> **Summary:** ...` blockquote after each H2 section. Add `<!-- chunk-boundary -->` between major sections. Add anchor IDs to H2/H3 headings using `{#section-slug}` syntax.");
  if (opts.mdx)                   goals.push("- Preserve all JSX/MDX components. Add descriptive comments above each component.");

  const systemPrompt = `You are an expert technical writer optimizing documents for RAG (Retrieval-Augmented Generation) and GEO (Generative Engine Optimization).

Optimize this document according to these goals:
${goals.join("\n")}

Rules:
- Return ONLY the improved Markdown/MDX. No explanations, no wrapping code fences.
- Preserve all existing content — improve structure and clarity, do not remove information.
- For frontmatter: enrich if exists, add if missing. Always include last_reviewed and expires.
- For RAG: each H2 section gets a summary blockquote and chunk-boundary marker.
- For GEO: bold key phrases that AI search engines would match on.
- For headings: add {#slug} anchor IDs for citation targeting.
- Keep chunk sizes between 100-500 words per section (split if oversized).
- Maintain the author's voice and tone.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n---\n\nDocument to optimize:\n\n${content}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      console.error("Gemini API error:", err);
      return Response.json(
        { error: "AI service error. Please try again." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const data = await geminiRes.json();
    let result = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // Strip code fences if Gemini wrapped output
    result = result.replace(/^```(?:markdown|md|mdx)?\s*\n/i, "").replace(/\n```\s*$/, "");

    return Response.json(
      { result: result.trim(), model: "gemini-3.6-flash", mode: "ai" },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Markdown format error:", err);
    return Response.json(
      { error: "AI service unavailable. Please try again." },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS" && (url.pathname === MCP_PATH || url.pathname === "/api/markdown/format")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Markdown Format API (Gemini-powered, free) ──────────────────
    if (url.pathname === "/api/markdown/format") {
      if (request.method === "POST") {
        return handleMarkdownFormat(request);
      }
      return Response.json({ status: "ok", endpoint: "/api/markdown/format", method: request.method }, { status: 200, headers: CORS_HEADERS });
    }

    // Health / info endpoint
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        name: "Poly-Glot AI Workspace MCP",
        status: "ok",
        deploy: 39,
        version: "1.10.0",
        endpoint: MCP_PATH,
        templates: templates.length,
        freeTemplates: templates.filter((t) => t.plan === "free").length,
        supportedLanguages: languagePublicList().length,
        tools: 15,
        pricing: publicPricing(),
        trial: { days: 3, startsOn: "first Send", autoConverts: false },
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
        const errorCode = error?.code || "TRANSPORT_ERROR";
        recordError({
          toolName: "mcp_transport",
          errorType: error?.message || String(error),
          clientName: "unknown",
          userKey: null,
          sessionKey: null,
          metadata: { code: errorCode },
        });
        return Response.json({ error: "Internal server error", code: errorCode }, { status: 500 });
      }
    }

    return Response.json({ debug: true, pathname: url.pathname, method: request.method, msg: "No route matched" }, { status: 404 });
  },
};
