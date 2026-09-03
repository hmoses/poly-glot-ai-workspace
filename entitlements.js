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
 * ENTITLEMENT MODEL (v1.9):
 *   Trial (3 days) — ALL features free: every template (free + pro), Compare Mode, BYOM.
 *   Expired — ALL templates lock. Ask Any AI = 1 free send/week, single AI only. Compare Mode locked.
 *   Pro — Everything unlimited.
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
 * Calculate the next Monday 00:00 UTC — weekly free send reset point.
 * Returns ISO-8601 timestamp string.
 */
function nextWeeklyResetAt() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  // Days until next Monday: if today is Mon (1) and past midnight, next Mon is 7 days away.
  // Formula: (8 - day) % 7 gives days to next Monday, but 0 means today IS Monday.
  let daysUntil = (8 - day) % 7;
  if (daysUntil === 0) daysUntil = 7; // If today is Monday, next reset is NEXT Monday
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntil,
    0, 0, 0, 0
  ));
  return next.toISOString();
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
  const row = store.users[key] || { state: ENTITLEMENT_STATES.NOT_STARTED, trialStartedAt: null, trialEndsAt: null };
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
  const trialActive = base.state === ENTITLEMENT_STATES.TRIAL && (!base.trialEndsAt || Date.now() < Date.parse(base.trialEndsAt));
  const isExpired = base.state === ENTITLEMENT_STATES.EXPIRED;
  // After trial expires, users get 1 free Ask Any AI send/week (single AI, no Compare)
  // canUseFree means the user can use the Ask Any AI feature (with weekly limit if expired)
  const canUseFree = base.state === ENTITLEMENT_STATES.NOT_STARTED || trialActive || isPro || isExpired;
  const weeklyFreeLimit = isExpired ? PRICING.weeklyFreeSends : null;
  // Compare Mode: only Pro and active trial can use it
  const compareLocked = !(isPro || trialActive);
  // Next weekly reset: only relevant for expired users
  const nextResetAt = isExpired ? nextWeeklyResetAt() : null;
  return {
    ...base,
    isPro,
    trialActive,
    canUseFree,
    isExpired,
    weeklyFreeLimit,
    compareLocked,
    nextResetAt,
    pricing: publicPricing(),
  };
}

export async function startTrialIfNeeded(extra) {
  if (REMOTE_URL || PRODUCTION) {
    if (!REMOTE_URL) throw new Error("POLYGLOT_ENTITLEMENT_ENDPOINT is required in production");
    // Trial starts must be persisted by the production account/entitlement service.
    // POST is intentionally opt-in so deployments can keep entitlement reads read-only.
    const startUrl = String(process.env.POLYGLOT_TRIAL_START_ENDPOINT || "").trim();
    if (!startUrl) return getEntitlement(extra);
    const token = authToken(extra);
    if (!token) return getEntitlement(extra);
    const response = await fetch(startUrl, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ trialDays: PRICING.trialDays }) });
    if (!response.ok) throw new Error(`Trial service returned ${response.status}`);
    return { ...normalizeRemote(await response.json()), pricing: publicPricing() };
  }

  const current = localEntitlement(extra);
  if (current.state !== ENTITLEMENT_STATES.NOT_STARTED) return getEntitlement(extra);
  const store = loadStore();
  const key = subjectKey(extra);
  const start = new Date();
  const end = new Date(start.getTime() + PRICING.trialDays * MS_PER_DAY);
  store.users[key] = { state: ENTITLEMENT_STATES.TRIAL, trialStartedAt: start.toISOString(), trialEndsAt: end.toISOString(), updatedAt: nowIso() };
  saveStore(store);
  return getEntitlement(extra);
}

/**
 * Template access for the new entitlement model (v1.9):
 *   Trial — ALL templates allowed (free + pro). Full access.
 *   Expired — ALL templates LOCKED. Ask Any AI = 1/week, single AI. Compare locked.
 *             The weekly Ask Any AI send is handled at the send layer, not template access.
 *             Templates still show as locked so the UI can gate them properly.
 *   Pro — Everything allowed.
 *   Not started — Free templates allowed (triggers trial on first use).
 */
export function templateAccess(template, entitlement) {
  // Pro: always allowed
  if (entitlement.isPro) return { allowed: true, locked: false, reason: null };

  // Active trial: ALL templates allowed (free + pro)
  if (entitlement.trialActive) return { allowed: true, locked: false, reason: null };

  // Not started: free templates allowed (will trigger trial on build_prompt)
  if (entitlement.state === ENTITLEMENT_STATES.NOT_STARTED) {
    if (template.plan === "free") return { allowed: true, locked: false, reason: null };
    return { allowed: false, locked: true, reason: "pro_required" };
  }

  // Expired: ALL templates locked. Ask Any AI weekly send handled separately.
  if (entitlement.isExpired) {
    return {
      allowed: false,
      locked: true,
      reason: "trial_expired",
      weeklyLimited: true,
      weeklyFreeLimit: entitlement.weeklyFreeLimit,
      nextResetAt: entitlement.nextResetAt,
      message: `Your trial has ended. You have 1 free Ask Any AI send per week (resets Monday). Subscribe to Pro for unlimited access.`,
    };
  }

  // Fallback
  return { allowed: false, locked: true, reason: "subscription_required" };
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
    weeklyFreeLimit: entitlement.weeklyFreeLimit,
    compareLocked: entitlement.compareLocked,
    nextResetAt: entitlement.nextResetAt,
    pricing,
  };
}
