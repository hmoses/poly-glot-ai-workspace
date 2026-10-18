import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";

const store = join(tmpdir(), `polyglot-entitlements-check-${process.pid}.json`);
process.env.POLYGLOT_ENTITLEMENT_STORE = store;
process.env.POLYGLOT_MCP_USER_ID = `check-${process.pid}`;
const { consumeDailyFreeSend, getEntitlement, startTrialIfNeeded, templateAccess } = await import(`../entitlements.js?check=${Date.now()}`);

const before = await getEntitlement({});
if (before.state !== "not_started" || before.canUseFree || before.isPro)
  throw new Error("Unsubscribed users must have no workspace allowance.");
if (templateAccess({plan:"free"},before).allowed || templateAccess({plan:"pro"},before).allowed)
  throw new Error("All templates must be locked before subscription.");

const trial = await startTrialIfNeeded({});
if (trial.state !== "not_started" || trial.trialActive)
  throw new Error("An MCP request must not start a paid Apple intro offer.");

const firstFree = await consumeDailyFreeSend({});
if (firstFree.allowed) throw new Error("Free Sends must be denied without an entitlement.");

const accountKey = "local:" + createHash("sha256").update(process.env.POLYGLOT_MCP_USER_ID).digest("hex");
writeFileSync(store, JSON.stringify({users:{[accountKey]:{
  state:"trial",trialStartedAt:new Date(Date.now()-86400000).toISOString(),
  trialEndsAt:new Date(Date.now()+86400000).toISOString()
}}}));
const trialCheck = await getEntitlement({});
if (!trialCheck.trialActive || !templateAccess({plan:"free"},trialCheck).allowed
  || !templateAccess({plan:"pro"},trialCheck).allowed)
  throw new Error("Valid existing trials must retain all functionality.");

writeFileSync(store,JSON.stringify({users:{[accountKey]:{state:"pro_monthly"}}}));
const paid = await getEntitlement({});
if (!paid.isPro || !templateAccess({plan:"pro"},paid).allowed)
  throw new Error("Verified paid accounts must retain full access.");


console.log(JSON.stringify({
  preSubscription: before.state, firstSendTrialDenied: trial.state==="not_started",
  noFreeSend: !firstFree.allowed, validTrialUnblocked: trialCheck.trialActive,
  validSubscriberUnblocked: paid.isPro, pricingNoFreeTier: true
},null,2));
rmSync(store,{force:true});
