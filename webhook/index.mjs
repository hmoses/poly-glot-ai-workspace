/**
 * Poly-Glot Apple ↔ MCP Auto-Sync Webhook Receiver
 *
 * Neon Function that receives App Store Connect webhook notifications,
 * verifies authenticity, and triggers the GitHub Actions deployment pipeline.
 *
 * Apple ASC Webhook Docs:
 * https://developer.apple.com/documentation/appstoreconnectapi/app_store_connect_api_webhooks
 *
 * Environment variables:
 *   APPSTORE_WEBHOOK_SECRET  — Shared secret configured in ASC webhook setup
 *   GITHUB_WEBHOOK_TOKEN     — GitHub PAT with workflow dispatch permission
 *   GITHUB_REPO_OWNER        — e.g., "hmoses"
 *   GITHUB_REPO_NAME         — e.g., "poly-glot-ai-workspace"
 *   POLYGLOT_APP_BUNDLE_ID   — e.g., "ai.polyglot.workspace"
 */

const BUNDLE_ID = process.env.POLYGLOT_APP_BUNDLE_ID || "ai.polyglot.workspace";

const EVENTS = {
  BUILD_COMPLETE: "DID_COMPLETE",
  READY_FOR_DISTRIBUTION: "READY_FOR_DISTRIBUTION",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function logEvent(type, data) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), type, ...data }));
}

function verifySecret(request) {
  const secret = process.env.APPSTORE_WEBHOOK_SECRET;
  if (!secret) throw new Error("APPSTORE_WEBHOOK_SECRET not configured");
  const provided = request.headers.get("x-apple-webhook-secret") || request.headers.get("X-Apple-Webhook-Secret");
  if (!provided || provided !== secret) throw new Error("Webhook secret mismatch");
}

function parsePayload(body) {
  try {
    const notification = JSON.parse(body);
    if (notification.signedPayload) {
      const parts = notification.signedPayload.split(".");
      if (parts.length !== 3) throw new Error("Invalid JWS format");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return payload;
    }
    return notification;
  } catch (err) {
    throw new Error("Failed to parse webhook payload: " + err.message);
  }
}

function extractEvent(payload) {
  const notificationType = payload.notificationType || payload.type || "UNKNOWN";
  const data = payload.data || payload;
  return {
    notificationType,
    appId: data.appId || data.adamId || null,
    bundleId: data.bundleId || data.app?.bundleId || null,
    platform: data.platform || null,
    version: data.versionString || data.version || null,
    buildNumber: data.buildNumber || null,
    buildState: data.processingState || data.buildState || null,
    versionState: data.appStoreState || data.versionState || null,
    environment: data.environment || "PRODUCTION",
  };
}

function determineAction(event) {
  if (event.bundleId && event.bundleId !== BUNDLE_ID) {
    return { action: "IGNORE", reason: "Bundle ID mismatch: " + event.bundleId };
  }
  if (event.buildState === EVENTS.BUILD_COMPLETE || event.notificationType === "BUILD_PROCESSING_COMPLETE") {
    return { action: "STAGE", reason: "Build processing complete" };
  }
  if (event.versionState === EVENTS.READY_FOR_DISTRIBUTION || event.versionState === "READY_FOR_SALE") {
    return { action: "PRODUCTION", reason: "Version ready for distribution" };
  }
  return { action: "LOG_ONLY", reason: "Unhandled event: " + event.notificationType };
}

async function triggerGitHub(event, action) {
  const token = process.env.GITHUB_WEBHOOK_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER || "hmoses";
  const repo = process.env.GITHUB_REPO_NAME || "poly-glot-ai-workspace";
  if (!token) {
    logEvent("GITHUB_SKIP", { reason: "GITHUB_WEBHOOK_TOKEN not configured" });
    return { triggered: false, reason: "No GitHub token" };
  }
  const response = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/dispatches", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: "apple-webhook-" + action.toLowerCase(),
      client_payload: {
        action, platform: event.platform || "unknown", version: event.version || "unknown",
        buildNumber: event.buildNumber || "unknown", notificationType: event.notificationType,
        timestamp: new Date().toISOString(),
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    logEvent("GITHUB_ERROR", { status: response.status, body: text });
    return { triggered: false, reason: "GitHub API error: " + response.status };
  }
  logEvent("GITHUB_TRIGGERED", { action, owner, repo });
  return { triggered: true, action };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({ service: "polyglot-apple-webhook", status: "ok", bundleId: BUNDLE_ID, timestamp: new Date().toISOString() });
    }
    if (request.method === "POST" && url.pathname === "/webhook") {
      try {
        verifySecret(request);
        const body = await request.text();
        const payload = parsePayload(body);
        const event = extractEvent(payload);
        logEvent("WEBHOOK_RECEIVED", event);
        const decision = determineAction(event);
        logEvent("POLICY_DECISION", decision);
        let githubResult = { triggered: false, reason: "No action required" };
        if (decision.action === "STAGE" || decision.action === "PRODUCTION") {
          githubResult = await triggerGitHub(event, decision.action);
        }
        const record = { eventId: crypto.randomUUID(), timestamp: new Date().toISOString(), event, decision, githubResult };
        logEvent("DEPLOYMENT_RECORD", record);
        return jsonResponse({ status: "accepted", action: decision.action, reason: decision.reason, eventId: record.eventId });
      } catch (err) {
        logEvent("WEBHOOK_ERROR", { error: err.message });
        return jsonResponse({ status: "error", message: err.message }, 401);
      }
    }
    return jsonResponse({ status: "not_found" }, 404);
  },
};
