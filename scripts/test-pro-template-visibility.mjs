import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
function section(from, to) {
  const a=source.indexOf(from), b=source.indexOf(to, a+from.length);
  assert.ok(a>=0 && b>a, "Expected server handler section");
  return source.slice(a,b);
}
const catalog=[
  {name:"Free Example",desc:"free text",plan:"free",goal:"writing"},
  {name:"Secret Pro Example",desc:"premium details",plan:"pro",goal:"writing"}
];
const searchSource = section("const searchTemplates =", "const entitlementSchema =");
const search = runInNewContext(searchSource+"\nsearchTemplates",{
  templates:catalog,
  localizedTemplateMeta:t=>({name:t.name,description:t.desc}),
  publicTemplate:(t,e)=>({id:t.name,name:t.name,description:t.desc,plan:t.plan,locked:t.plan==="pro"&&!e.isPro&&!e.trialActive})
});
for(const [label,e,expected] of [
  ["expired",{state:"expired",isExpired:true,isPro:false,trialActive:false},["Free Example"]],
  ["lapsed trial",{state:"trial",isPro:false,trialActive:false},["Free Example"]],
  ["unknown",{state:"unknown",isPro:false,trialActive:false},["Free Example"]],
  ["active trial",{state:"trial",isPro:false,trialActive:true},["Free Example","Secret Pro Example"]],
  ["monthly Pro",{state:"pro_monthly",isPro:true,trialActive:false},["Free Example","Secret Pro Example"]],
  ["pretrial",{state:"not_started",isPro:false,trialActive:false},["Free Example","Secret Pro Example"]]
]){
  test("catalog visibility: "+label,()=>{
    const result=search({limit:24},e);
    assert.deepEqual(Array.from(result,x=>x.name),expected);
    if(expected.length===1)assert.equal(search({plan:"pro"},e).length,0);
  });
}
const lockedSource=section("function lockedResult(", "const languageSchema =");
const locked=runInNewContext(lockedSource+"\nlockedResult", {
 publicTemplate:t=>({id:t.name,name:t.name,description:t.desc,fields:[{key:"secret"}],plan:t.plan}),
 entitlementSummary:e=>e
});
test("post-trial direct Pro lookup redacts editor fields, prompt text and IDs",()=>{
  const e={state:"expired",isExpired:true,isPro:false,trialActive:false,nextResetAt:null};
  const body=locked(catalog[1],e).structuredContent.template;
  assert.equal(body.plan,"pro");
  assert.equal(body.name,"Pro template");
  assert.equal(body.id,"");
  assert.equal(body.description.includes("premium details"),false);
  assert.equal(body.fields.length,0);
  assert.equal(body.hasPrompt,false);
});
test("active subscribers keep full Pro metadata",()=>{
  const e={state:"pro_monthly",isExpired:false,isPro:true,trialActive:false,nextResetAt:null};
  const body=locked(catalog[1],e).structuredContent.template;
  assert.equal(body.name,"Secret Pro Example");
});
