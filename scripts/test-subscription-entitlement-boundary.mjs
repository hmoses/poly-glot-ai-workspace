/**
 * Subscription-only safety: Apple subscriptions must have a live expiry, with
 * no revocation, and legacy app-managed trials are never a subscription entitlement.
 * No real Neon DB, Apple receipts, or API credentials are needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test_entitlement';
const [{stateFrom}, {startTrial,consumeFreeSend}] = await Promise.all([
  import('../entitlement-service/server.js'),
  import('../entitlement-service/db.js'),
]);
const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);
const monthly = 'ai.polyglot.workspace.pro.monthly';
const annual = 'ai.polyglot.workspace.pro.annual';
const row = (product_id,expires_at,revocation_date=null) => ({transaction:{product_id,expires_at,revocation_date},user:null});

test('Apple verified monthly and annual plans grant Pro only before expiry',()=>{
  assert.equal(stateFrom(row(monthly,future)), 'pro_monthly');
  assert.equal(stateFrom(row(annual,future)), 'pro_annual');
  assert.equal(stateFrom(row(monthly,past)), 'not_started');
  assert.equal(stateFrom(row(annual,null)), 'not_started');
  assert.equal(stateFrom(row(monthly,undefined)), 'not_started');
  assert.equal(stateFrom(row(monthly,future,past)), 'not_started');
  assert.equal(stateFrom(row('unrecognized',future)), 'not_started');
});
test('Legacy app-managed trials never grant subscription access',()=>{
  assert.equal(stateFrom({user:{trial_ends_at:future},transaction:null}),'expired');
  assert.equal(stateFrom({user:{trial_ends_at:past},transaction:null}),'expired');
  assert.equal(stateFrom({user:{trial_ends_at:'invalid'},transaction:null}),'not_started');
  assert.equal(stateFrom({user:null,transaction:null}),'not_started');
  assert.equal(stateFrom({user:{trial_ends_at:future},transaction:row(monthly,past).transaction}),'expired');
});
test('MCP compatibility methods cannot generate trials or consume free Sends',async()=>{
  await assert.rejects(()=>startTrial('legacy-user'),/Apple subscription authorization required/);
  assert.deepEqual(await consumeFreeSend('legacy-user'),{
    allowed:false,lastFreeSendAt:null,reason:'subscription_required'
  });
});
test('Production lookup query rejects missing subscription expiry',async()=>{
  const {readFileSync}=await import('node:fs');
  const db=readFileSync(new URL('../entitlement-service/db.js',import.meta.url),'utf8');
  assert.match(db,/AND expires_at > now\(\)/);
  assert.doesNotMatch(db,/expires_at IS NULL OR expires_at > now\(\)/);
});

test('Public MCP health advertises only active entitlements, not legacy free catalog tags',async()=>{
  const {readFileSync}=await import('node:fs');
  const src=readFileSync(new URL('../index.mjs',import.meta.url),'utf8');
  assert.match(src,/freeTemplates: publicPricing\(\).freeTemplateCount/);
  assert.match(src,/startsOn: "Apple subscription approval"/);
  assert.match(src,/requiresApplePurchaseAuthorization: true/);
  assert.match(src,/renewsAutomaticallyUnlessCanceled: true/);
  assert.doesNotMatch(src,/startsOn: "first Send"/);
});

test('Node HTTP and Neon Web status expose the same subscription-only trial terms',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(source,/freeTemplates: publicPricing\(\).freeTemplateCount/);
  assert.match(source,/startsOn: "Apple subscription approval"/);
  assert.match(source,/renewsAutomaticallyUnlessCanceled: true/);
  assert.doesNotMatch(source,/startsOn: "first Send"/);
  const config=JSON.parse(readFileSync(new URL('../config/polyglot-capabilities.json',import.meta.url),'utf8'));
  assert.equal(config.plans.free.dailyFreeSends,0);
  assert.equal(config.plans.free.freeTemplateCount,0);
  assert.equal(config.trial.renewsAutomaticallyUnlessCanceled,true);
});
