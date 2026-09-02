/**
 * Poly-Glot Apple ↔ MCP Auto-Sync Webhook Receiver
 *
 * Neon Function that receives App Store Connect webhook notifications,
 * verifies HMAC-SHA256 authenticity, and triggers the GitHub Actions
 * deployment pipeline.
 *
 * Apple ASC Webhook Docs:
 * https://developer.apple.com/documentation/appstoreconnectapi/configuring-webhook-notifications
 * https://developer.apple.com/documentation/appstoreconnectapi/webhook-notifications
 *
 * Authentication: HMAC-SHA256
 *   Apple signs each POST body with the shared secret configured when
 *   creating the webhook via the ASC API. The signature is sent in:
 *     x-apple-signature: hmacsha256=<hex>
 *   We recompute the HMAC locally and compare in constant time.
 *
 * Payload format (ASC webhooks, NOT App Store Server Notifications V2):
 *   {
 *     "data": {
 *       "type": "<eventType>",          // e.g. "appStoreVersionAppVersionStateUpdated"
 *       "id": "<uuid>",
 *       "version": 1,
 *       "attributes": {
 *         "newValue": "READY_FOR_REVIEW",
 *         "oldValue": "PREPARE_FOR_SUBMISSION",
 *         "timestamp": "2025-04-16T05:00:52.745Z"
 *       },
 *       "relationships": { "instance": { "data": { "type": "appStoreVersions", "id": "..." } } }
 *     }
 *   }
 *
 * Environment variables:
 *   APPSTORE_WEBHOOK_SECRET  — Shared secret configured in ASC webhook setup
 *   GITHUB_WEBHOOK_TOKEN     — GitHub PAT with workflow dispatch permission
 *   GITHUB_REPO_OWNER        — e.g., "hmoses"
 *   GITHUB_REPO_NAME         — e.g., "poly-glot-ai-workspace"
 *   POLYGLOT_APP_BUNDLE_ID   — e.g., "ai.polyglot.workspace" (optional, used for extra filtering)
 */

// Web Crypto subtle is available in Neon Functions and modern runtimes.
const BUNDLE_ID = process.env.POLYGLOT_APP_BUNDLE_ID || "ai.polyglot.workspace";

// Processed event IDs for idempotency (in-memory per instance; sufficient for
// serverless cold-start isolation; a persistent store can be added later).
const processedEvents = new Set();

// ── Helpers ────────────────────────────────────────────────────────────

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function logEvent(type, data) {
  // Never log secrets, tokens, or raw signatures
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), type, ...data }));
}

/**
 * Hex-encode an ArrayBuffer.
 */
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── HMAC Verification ──────────────────────────────────────────────────

/**
 * Verify the HMAC-SHA256 signature from Apple.
 *
 * Apple sends: x-apple-signature: hmacsha256=<hex-encoded-hash>
 *
 * We recompute the HMAC of the raw request body using our shared secret
 * and compare in constant time.
 */
async function verifyHmacSignature(request, rawBody) {
  const secret = process.env.APPSTORE_WEBHOOK_SECRET;
  if (!secret) throw Object.assign(new Error("APPSTORE_WEBHOOK_SECRET not configured"), { statusCode: 500 });

  const signatureHeader = request.headers.get("x-apple-signature") || "";
  if (!signatureHeader) {
    throw Object.assign(new Error("Missing x-apple-signature header"), { statusCode: 401 });
  }

  // Format: "hmacsha256=<hex>"
  const match = signatureHeader.match(/^hmacsha256=([a-f0-9]+)$/i);
  if (!match) {
    throw Object.assign(new Error("Invalid x-apple-signature format"), { statusCode: 401 });
  }
  const appleHash = match[1].toLowerCase();

  // Compute HMAC-SHA256 using Web Crypto API (available in Neon Functions)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedHash = bufToHex(signature);

  if (!timingSafeEqual(computedHash, appleHash)) {
    throw Object.assign(new Error("HMAC signature verification failed"), { statusCode: 401 });
  }
}

// ── Payload Parsing ────────────────────────────────────────────────────

/**
 * Parse the ASC webhook payload.
 *
 * ASC webhooks (not App Store Server Notifications V2) send plain JSON:
 * { data: { type, id, version, attributes, relationships } }
 */
function parsePayload(body) {
  try {
    return JSON.parse(body);
  } catch (err) {
    throw Object.assign(new Error("Malformed JSON payload: " + err.message), { statusCode: 400 });
  }
}

/**
 * Extract a normalized event from the ASC webhook payload.
 *
 * Known ASC webhook event types (from Apple docs):
 *   APP_STORE_VERSION_APP_VERSION_STATE_UPDATED
 *   BUILD_BUNDLE_PROCESSING_STATE_UPDATED
 *   (and others — see WebhookEventType in ASC API docs)
 */
function extractEvent(payload) {
  const data = payload?.data || {};
  const eventType = data.type || "unknown";
  const eventId = data.id || null;
  const attributes = data.attributes || {};
  const relationships = data.relationships || {};

  // The instance relationship points to the appStoreVersion or build
  const instanceType = relationships?.instance?.data?.type || null;
  const instanceId = relationships?.instance?.data?.id || null;

  return {
    eventType,
    eventId,
    newValue: attributes.newValue || null,
    oldValue: attributes.oldValue || null,
    timestamp: attributes.timestamp || null,
    instanceType,
    instanceId,
    ping: attributes.ping === true,
  };
}

// ── Policy Decision ────────────────────────────────────────────────────

/**
 * Determine action based on the ASC webhook event.
 *
 * ASC webhook event types from Apple docs:
 *   - appStoreVersionAppVersionStateUpdated → version state changes
 *   - buildBundleProcessingStateUpdated → build processing changes
 *
 * State values (from attributes.newValue):
 *   Builds: PROCESSING, FAILED, VALID, INVALID
 *   Versions: PREPARE_FOR_SUBMISSION, WAITING_FOR_REVIEW, IN_REVIEW,
 *             READY_FOR_DISTRIBUTION, DEVELOPER_REJECTED, REJECTED, etc.
 */
function determineAction(event) {
  // Ping events are test deliveries — acknowledge but take no action
  if (event.ping) {
    return { action: "PONG", reason: "Webhook ping received" };
  }

  // Build processing completed successfully
  if (event.eventType === "buildBundleProcessingStateUpdated" && event.newValue === "VALID") {
    return { action: "STAGE", reason: "Build processing succeeded (VALID)" };
  }

  // Build processing failed
  if (event.eventType === "buildBundleProcessingStateUpdated" && event.newValue === "FAILED") {
    return { action: "LOG_ONLY", reason: "Build processing failed" };
  }

  // Version state → ready for distribution (approved by Apple)
  if (event.eventType === "appStoreVersionAppVersionStateUpdated" && event.newValue === "READY_FOR_DISTRIBUTION") {
    return { action: "PRODUCTION", reason: "Version approved — READY_FOR_DISTRIBUTION" };
  }

  // Version state → other transitions (informational)
  if (event.eventType === "appStoreVersionAppVersionStateUpdated") {
    return { action: "LOG_ONLY", reason: `Version state: ${event.oldValue} → ${event.newValue}` };
  }

  return { action: "LOG_ONLY", reason: "Unhandled event type: " + event.eventType };
}

// ── GitHub Dispatch ────────────────────────────────────────────────────

async function triggerGitHub(event, action) {
  const token = process.env.GITHUB_WEBHOOK_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER || "hmoses";
  const repo = process.env.GITHUB_REPO_NAME || "poly-glot-ai-workspace";
  if (!token) {
    logEvent("GITHUB_SKIP", { reason: "GITHUB_WEBHOOK_TOKEN not configured" });
    return { triggered: false, reason: "No GitHub token" };
  }
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: `apple-webhook-${action}`,
        client_payload: {
          action,
          eventType: event.eventType,
          eventId: event.eventId,
          newValue: event.newValue,
          oldValue: event.oldValue,
          instanceType: event.instanceType,
          instanceId: event.instanceId,
          timestamp: new Date().toISOString(),
        },
      }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    logEvent("GITHUB_ERROR", { status: response.status, body: text.slice(0, 200) });
    return { triggered: false, reason: `GitHub API error: ${response.status}` };
  }
  logEvent("GITHUB_TRIGGERED", { action, owner, repo });
  return { triggered: true, action };
}

// ── Main Handler ───────────────────────────────────────────────────────

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health endpoint
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({
        service: "polyglot-apple-webhook",
        status: "ok",
        authMethod: "HMAC-SHA256 (x-apple-signature)",
        bundleId: BUNDLE_ID,
        timestamp: new Date().toISOString(),
      });
    }

    // Webhook endpoint — POST only
    if (request.method === "POST" && url.pathname === "/webhook") {
      try {
        // Read body once for both HMAC verification and parsing
        const rawBody = await request.text();

        // Verify HMAC-SHA256 signature
        await verifyHmacSignature(request, rawBody);

        // Parse and extract event
        const payload = parsePayload(rawBody);
        const event = extractEvent(payload);
        logEvent("WEBHOOK_RECEIVED", {
          eventType: event.eventType,
          eventId: event.eventId,
          newValue: event.newValue,
          ping: event.ping,
        });

        // Idempotency: skip already-processed events
        if (event.eventId && processedEvents.has(event.eventId)) {
          logEvent("IDEMPOTENT_SKIP", { eventId: event.eventId });
          return jsonResponse({ status: "already_processed", eventId: event.eventId });
        }

        // Policy decision
        const decision = determineAction(event);
        logEvent("POLICY_DECISION", { action: decision.action, reason: decision.reason });

        // Trigger GitHub Actions for actionable events
        let githubResult = { triggered: false, reason: "No action required" };
        if (decision.action === "STAGE" || decision.action === "PRODUCTION") {
          githubResult = await triggerGitHub(event, decision.action);
        }

        // Record event as processed
        if (event.eventId) {
          processedEvents.add(event.eventId);
          // Bound the set size to prevent memory leaks in long-running instances
          if (processedEvents.size > 10000) {
            const first = processedEvents.values().next().value;
            processedEvents.delete(first);
          }
        }

        const record = {
          eventId: event.eventId || crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: event.eventType,
          action: decision.action,
          reason: decision.reason,
          githubTriggered: githubResult.triggered,
        };
        logEvent("DEPLOYMENT_RECORD", record);

        return jsonResponse({
          status: "accepted",
          action: decision.action,
          reason: decision.reason,
          eventId: record.eventId,
        });
      } catch (err) {
        const statusCode = err.statusCode || 500;
        logEvent("WEBHOOK_ERROR", { error: err.message, statusCode });
        return jsonResponse({ status: "error", message: err.message }, statusCode);
      }
    }

    return jsonResponse({ status: "not_found" }, 404);
  },
};
