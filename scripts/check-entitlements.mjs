import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const store = join(tmpdir(), `polyglot-entitlements-check-${process.pid}.json`);
process.env.POLYGLOT_ENTITLEMENT_STORE = store;
process.env.POLYGLOT_MCP_USER_ID = `check-${process.pid}`;
const { getEntitlement, startTrialIfNeeded, templateAccess } = await import(`../entitlements.js?check=${Date.now()}`);

const before = await getEntitlement({});
if (before.state !== "not_started" || !before.canUseFree || before.isPro) throw new Error("Expected not_started free access");
const freeAccess = templateAccess({ plan: "free" }, before);
const proAccess = templateAccess({ plan: "pro" }, before);
if (!freeAccess.allowed || proAccess.allowed) throw new Error("Template plan gate is incorrect before trial");

const trial = await startTrialIfNeeded({});
if (trial.state !== "trial" || !trial.trialActive || !trial.trialEndsAt) throw new Error("Trial did not start");
const durationHours = (Date.parse(trial.trialEndsAt) - Date.parse(trial.trialStartedAt)) / 3600000;
if (Math.abs(durationHours - 72) > 0.01) throw new Error(`Expected 72-hour trial, got ${durationHours}`);

console.log(JSON.stringify({ before: before.state, afterFirstUse: trial.state, trialHours: durationHours, freeAllowed: freeAccess.allowed, proLocked: !proAccess.allowed }, null, 2));
rmSync(store, { force: true });
