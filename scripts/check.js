import { readFileSync } from "node:fs";
import { PRICING } from "../pricing.js";

const c = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const bodies = Object.keys(c.prompts).length;
const templates = c.templates.length;
const freeTemplates = c.templates.filter((t) => t.plan === "free").length;
const proTemplates = c.templates.filter((t) => t.plan === "pro").length;
const missing = c.templates.filter((t) => !(c.prompts[t.name] || c.prompts[String(t.name).replace(/^[^\p{L}\p{N}]+/u, "").trim()])).length;
const pricingMatches = PRICING.trialDays === 3 && PRICING.freeTemplateCount === 0 && PRICING.dailyFreeSends === 0 && PRICING.monthly.price === 9.99 && PRICING.annual.price === 79.99;

console.log(JSON.stringify({
  templates,
  promptBodies: bodies,
  freeTemplates,
  proTemplates,
  templatesWithoutPromptBody: missing,
  pricingMatches,
}, null, 2));

// Catalog retains 25 historical tags for backward compatibility; none grant free access.
if (templates < 1000 || bodies < 1000 || missing !== 0 || !pricingMatches) process.exit(1);
