/**
 * Poly-Glot BYOM reference module.
 *
 * Goose should adapt this to the repository's existing logging, analytics,
 * entitlement, and error conventions. Do not persist credentials.
 */
import dns from "node:dns/promises";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2_000_000;

function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    p[0] === 0
  );
}

function isPrivateIPv6(ip) {
  const s = ip.toLowerCase();
  return s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80:");
}

export function redactSecret(value) {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 8) return "[REDACTED]";
  return `${s.slice(0, 3)}…[REDACTED]…${s.slice(-2)}`;
}

export function sanitizeError(error, secrets = []) {
  let msg = String(error?.message || error || "Unknown error");
  for (const secret of secrets.filter(Boolean)) {
    msg = msg.split(String(secret)).join("[REDACTED]");
  }
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer [REDACTED]");
  msg = msg.replace(/sk-[A-Za-z0-9_-]+/gi, "[REDACTED_API_KEY]");
  return msg.slice(0, 1200);
}

export async function validatePublicHttpsUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid model endpoint URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Custom model endpoints must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials must not be embedded in the endpoint URL.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Local or private network model endpoints are not reachable from the public Poly-Glot MCP.");
  }

  if (net.isIP(host)) {
    if ((net.isIPv4(host) && isPrivateIPv4(host)) || (net.isIPv6(host) && isPrivateIPv6(host))) {
      throw new Error("Private, loopback, link-local, and metadata-network endpoints are blocked.");
    }
  } else {
    const answers = await dns.lookup(host, { all: true });
    if (!answers.length) throw new Error("Model endpoint hostname could not be resolved.");
    for (const answer of answers) {
      if (
        (answer.family === 4 && isPrivateIPv4(answer.address)) ||
        (answer.family === 6 && isPrivateIPv6(answer.address))
      ) {
        throw new Error("Model endpoint resolves to a private or local network address.");
      }
    }
  }

  return url;
}

function buildOpenAIUrl(baseUrl) {
  const base = new URL(baseUrl);
  let path = base.pathname.replace(/\/+$/, "");
  if (path.endsWith("/chat/completions")) return base;
  if (!path.endsWith("/v1")) path += "/v1";
  path += "/chat/completions";
  base.pathname = path;
  return base;
}

function getJsonPath(obj, path) {
  if (!path) return undefined;
  const tokens = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const token of tokens) {
    if (cur == null || !(token in Object(cur))) return undefined;
    cur = cur[token];
  }
  return cur;
}

async function readJsonWithLimit(response, maxBytes = MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return await response.json();

  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error("Model response exceeded the Poly-Glot response size limit.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined));
}

export function customModelCapabilities() {
  return {
    adapterVersion: 1,
    modes: ["openai-compatible", "custom-rest"],
    credentialPersistence: "none",
    supportsTransientBearerAuth: true,
    supportsCustomApiKeyHeader: true,
    supportsComparePreparation: true,
    directLocalhostFromRemoteMcp: false,
    restrictions: [
      "HTTPS only",
      "POST only",
      "Private/loopback/link-local destinations blocked",
      "Credentials are never persisted",
      "Response size and timeout limits enforced"
    ]
  };
}

export async function invokeOpenAICompatible({
  baseUrl,
  model,
  apiKey,
  prompt,
  system,
  temperature,
  maxTokens,
  extraHeaders = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const validated = await validatePublicHttpsUrl(baseUrl);
  const target = buildOpenAIUrl(validated);
  await validatePublicHttpsUrl(target.toString());

  const allowedExtraHeaders = {};
  for (const [key, value] of Object.entries(extraHeaders || {})) {
    const k = key.toLowerCase();
    if (["x-api-key", "api-key", "anthropic-version"].includes(k)) {
      allowedExtraHeaders[key] = String(value);
    }
  }

  const headers = {
    "content-type": "application/json",
    ...allowedExtraHeaders
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt }
    ]
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (Number.isInteger(maxTokens)) body.max_tokens = maxTokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 1000), 60000));

  try {
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("Redirects are not automatically followed for custom model execution.");
    }

    const json = await readJsonWithLimit(response);
    if (!response.ok) {
      const providerMessage = json?.error?.message || json?.message || `HTTP ${response.status}`;
      throw new Error(`Custom model request failed: ${providerMessage}`);
    }

    const text =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.text ??
      json?.output_text;

    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Custom model returned no recognized text output.");
    }

    return {
      text,
      model: json?.model || model,
      usage: json?.usage || null,
      providerRequestId: response.headers.get("x-request-id") || null
    };
  } catch (error) {
    throw new Error(sanitizeError(error, [apiKey]));
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeCustomRest({
  endpoint,
  apiKey,
  authMode = "bearer",
  apiKeyHeader = "x-api-key",
  prompt,
  system,
  promptField = "prompt",
  systemField = "system",
  responseTextPath,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const target = await validatePublicHttpsUrl(endpoint);

  const headers = { "content-type": "application/json" };
  if (apiKey) {
    if (authMode === "bearer") headers.authorization = `Bearer ${apiKey}`;
    else if (authMode === "api-key-header") {
      const h = String(apiKeyHeader || "x-api-key").toLowerCase();
      if (!["x-api-key", "api-key"].includes(h)) {
        throw new Error("Only x-api-key or api-key are allowed for custom API-key header auth.");
      }
      headers[h] = apiKey;
    }
  }

  const body = { [promptField]: prompt };
  if (system && systemField) body[systemField] = system;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 1000), 60000));
  try {
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("Redirects are not automatically followed for custom model execution.");
    }

    const json = await readJsonWithLimit(response);
    if (!response.ok) {
      throw new Error(`Custom REST model request failed with HTTP ${response.status}.`);
    }

    const text = getJsonPath(json, responseTextPath);
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Configured response text path did not resolve to a non-empty string.");
    }
    return { text, usage: null, providerRequestId: response.headers.get("x-request-id") || null };
  } catch (error) {
    throw new Error(sanitizeError(error, [apiKey]));
  } finally {
    clearTimeout(timer);
  }
}
