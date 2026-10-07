import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const store = join(tmpdir(), `polyglot-entitlements-check-${process.pid}.json`);
process.env.POLYGLOT_ENTITLEMENT_STORE = store;
process.env.POLYGLOT_MCP_USER_ID = `check-${process.pid}`;
const { consumeDailyFreeSend, getEntitlement, startTrialIfNeeded, templateAccess } = await import(`../entitlements.js?check=${Date.now()}`);

const before = await getEntitlement({});
if (before.state !== "not_started" || !before.canUseFree || before.isPro) throw new Error("Expected not_started free access");
const freeAccess = templateAccess({ plan: "free" }, before);
const proAccess = templateAccess({ plan: "pro" }, before);
if (!freeAccess.allowed || proAccess.allowed) throw new Error("Template plan gate is incorrect before trial");

const trial = await startTrialIfNeeded({});
if (trial.state !== "trial" || !trial.trialActive || !trial.trialEndsAt) throw new Error("Trial did not start");
const durationHours = (Date.parse(trial.trialEndsAt) - Date.parse(trial.trialStartedAt)) / 3600000;
if (Math.abs(durationHours - 72) > 0.01) throw new Error(`Expected 72-hour trial, got ${durationHours}`);

// Force the local test account into post-trial free state, then verify one rolling free Send.
const persisted = JSON.parse(readFileSync(store, "utf8"));
const userKey = Object.keys(persisted.users)[0];
if (!userKey) throw new Error("Expected persisted local entitlement user");
persisted.users[userKey].state = "expired";
persisted.users[userKey].trialEndsAt = new Date(Date.now() - 1000).toISOString();
persisted.users[userKey].lastFreeSendAt = null;
writeFileSync(store, JSON.stringify(persisted, null, 2) + "\n", "utf8");

const freeState = await getEntitlement({});
if (!freeState.isExpired || freeState.dailyFreeRemaining !== 1 || freeState.nextResetAt !== null) {
  throw new Error("Expected one post-trial free Send to be immediately available");
}

const firstFree = await consumeDailyFreeSend({});
if (!firstFree.allowed || firstFree.entitlement.dailyFreeRemaining !== 0 || !firstFree.entitlement.nextResetAt) {
  throw new Error("First rolling free Send was not consumed correctly");
}

const secondFree = await consumeDailyFreeSend({});
if (secondFree.allowed || secondFree.entitlement.dailyFreeRemaining !== 0) {
  throw new Error("Second free Send inside the rolling 24-hour window should be blocked");
}

const resetMs = Date.parse(firstFree.entitlement.nextResetAt) - Date.parse(firstFree.entitlement.lastFreeSendAt);
if (Math.abs(resetMs - 24 * 60 * 60 * 1000) > 1000) {
  throw new Error(`Expected rolling 24-hour reset, got ${resetMs}ms`);
}

console.log(JSON.stringify({
  before: before.state,
  afterFirstUse: trial.state,
  trialHours: durationHours,
  freeAllowed: freeAccess.allowed,
  proLocked: !proAccess.allowed,
  postTrialFreeRemainingBeforeSend: freeState.dailyFreeRemaining,
  firstFreeSendAllowed: firstFree.allowed,
  secondFreeSendBlocked: !secondFree.allowed,
  rollingResetHours: resetMs / 3600000,
}, null, 2));
rmSync(store, { force: true });
