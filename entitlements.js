/**
 * POLY-GLOT ENTITLEMENT SOURCE-OF-TRUTH NOTE
 *
 * ChatGPT, Claude, and the Mac app must converge on the same verified account
 * entitlement. Do not create a Claude-only or ChatGPT-only Pro flag. In
 * production, authorization must come from the verified remote entitlement
 * service/Neon state and must fail closed when verification is unavailable.
 */
/**
 * POLY-GLOT ENTITLEMENT CLIENT
 * GOOSE NOTE: Production must call the remote, server-verified entitlement API.
 * The local JSON store exists only for development/testing and must never be a
 * production fallback. Fail closed when production verification is unavailable.
 *
 * SUBSCRIPTION-ONLY ENTITLEMENT MODEL:
 *   Valid Apple subscription (including its introductory trial): full access.
 *   Grandfathered, unexpired legacy app-managed trial: full access until expiry.
 *   No verified entitlement or expired legacy trial: workspace locked, including
 *   previously designated Free templates, History, Compare Mode and sends.
 *   No permanent free-Send allowance or MCP-activated trial.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENTITLEMENT_STATES, PRICING, publicPricing } from "./pricing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = process.env.POLYGLOT_ENTITLEMENT_STORE || join(__dirname, "data", "entitlements.json");
const REMOTE_URL = String(process.env.POLYGLOT_ENTITLEMENT_ENDPOINT || "").trim();
const DEV_PLAN = String(process.env.POLYGLOT_DEV_PLAN || "").trim();
const PRODUCTION = process.env.NODE_ENV === "production";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function nowIso() { return new Date().toISOString(); }
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }

/**
 * Calculate tomorrow 00:00 UTC — daily free send reset point.
 * Returns ISO-8601 timestamp string.
 */
function rollingResetAt(lastFreeSendAt) {
  if (!lastFreeSendAt) return null;
  const last = Date.parse(lastFreeSendAt);
  if (!Number.isFinite(last)) return null;
  return new Date(last + MS_PER_DAY).toISOString();
}

function loadStore() {
  try {
    if (!existsSync(STORE_PATH)) return { users: {} };
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    return parsed && typeof parsed === "object" && parsed.users ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

function saveStore(store) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function authToken(extra) {
  return extra?.authInfo?.token || extra?.authInfo?.accessToken || "";
}

function subjectKey(extra) {
  const token = authToken(extra);
  if (token) return `oauth:${hash(token)}`;
  // Local development fallback. Production should configure OAuth + a remote entitlement endpoint.
  const explicit = process.env.POLYGLOT_MCP_USER_ID || "anonymous-local";
  return `local:${hash(explicit)}`;
}

function normalizeRemote(data) {
  const state = data?.state || data?.plan || ENTITLEMENT_STATES.NOT_STARTED;
  if (!Object.values(ENTITLEMENT_STATES).includes(state)) throw new Error(`Invalid entitlement state from production service: ${state}`);
  return {
    state,
    userId: data?.userId || null,
    trialStartedAt: data?.trialStartedAt || null,
    trialEndsAt: data?.trialEndsAt || null,
    lastFreeSendAt: data?.lastFreeSendAt || null,
    source: "remote",
  };
}

async function remoteEntitlement(extra) {
  if (!REMOTE_URL) {
    if (PRODUCTION) throw new Error("POLYGLOT_ENTITLEMENT_ENDPOINT is required in production");
    return null;
  }
  const token = authToken(extra);
  if (!token) return { state: ENTITLEMENT_STATES.NOT_STARTED, userId: null, trialStartedAt: null, trialEndsAt: null, source: "remote-unauthenticated" };
  const response = await fetch(REMOTE_URL, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Entitlement service returned ${response.status}`);
  return normalizeRemote(await response.json());
}

function localEntitlement(extra) {
  if (DEV_PLAN && Object.values(ENTITLEMENT_STATES).includes(DEV_PLAN)) {
    return { state: DEV_PLAN, userId: "developer", trialStartedAt: null, trialEndsAt: null, source: "developer" };
  }
  const store = loadStore();
  const key = subjectKey(extra);
  const row = store.users[key] || { state: ENTITLEMENT_STATES.NOT_STARTED, trialStartedAt: null, trialEndsAt: null, lastFreeSendAt: null };
  if (row.state === ENTITLEMENT_STATES.TRIAL && row.trialEndsAt && Date.now() >= Date.parse(row.trialEndsAt)) {
    row.state = ENTITLEMENT_STATES.EXPIRED;
    store.users[key] = row;
    saveStore(store);
  }
  return { ...row, userId: key, source: "local" };
}

export async function getEntitlement(extra) {
  const remote = await remoteEntitlement(extra);
  const base = remote || (PRODUCTION ? (() => { throw new Error("Production entitlement service unavailable"); })() : localEntitlement(extra));
  const isPro = base.state === ENTITLEMENT_STATES.PRO_MONTHLY || base.state === ENTITLEMENT_STATES.PRO_ANNUAL;
  // A missing/corrupt legacy expiration must never grant an unlimited trial.
  const trialEndMs = Date.parse(base.trialEndsAt || "");
  const trialActive = base.state === ENTITLEMENT_STATES.TRIAL && Number.isFinite(trialEndMs) && Date.now() < trialEndMs;
  const isExpired = base.state === ENTITLEMENT_STATES.EXPIRED;
  // Verified subscriptions and grandfathered active trials only.
  const canUseFree = isPro || trialActive;
  const dailyFreeLimit = null;
  const dailyFreeRemaining = null;
  const nextResetAt = null;
  const compareLocked = !canUseFree;
  return {
    ...base,
    isPro,
    trialActive,
    canUseFree,
    isExpired,
    dailyFreeLimit,
    dailyFreeRemaining,
    lastFreeSendAt: base.lastFreeSendAt || null,
    compareLocked,
    nextResetAt,
    pricing: publicPricing(),
  };
}

// Kept for API compatibility; daily free Sends are discontinued.
export async function consumeDailyFreeSend(extra) {
  return {allowed: false, entitlement: await getEntitlement(extra)};
}

// A new introductory trial requires Apple purchase authorization.
// Keep this entry point for existing MCP integrations but never grant access.
export async function startTrialIfNeeded(extra) {
  return getEntitlement(extra);
}

/** Full workspace access requires a verified subscription or a legacy trial
 * that has not expired. No free templates or daily Sends remain. */
export function templateAccess(_template, entitlement) {
  if (entitlement.isPro || entitlement.trialActive)
    return {allowed: true, locked: false, reason: null};
  return {allowed: false, locked: true,
    reason: entitlement.isExpired ? "trial_expired" : "subscription_required",
    message: "A valid Poly-Glot subscription is required."};
}

export function entitlementSummary(entitlement) {
  const { state, trialEndsAt, pricing } = entitlement;
  return {
    state,
    trialEndsAt,
    isPro: entitlement.isPro,
    trialActive: entitlement.trialActive,
    canUseFree: entitlement.canUseFree,
    isExpired: entitlement.isExpired,
    dailyFreeLimit: entitlement.dailyFreeLimit,
    dailyFreeRemaining: entitlement.dailyFreeRemaining,
    lastFreeSendAt: entitlement.lastFreeSendAt,
    compareLocked: entitlement.compareLocked,
    nextResetAt: entitlement.nextResetAt,
    pricing,
    trialAutoConverts: null,
    purchaseRequired: true,
  };
}
