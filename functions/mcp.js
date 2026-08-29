/**
 * POLY-GLOT MCP NEON FUNCTION
 * Neon Function fetch(request) handler. All data imported statically for esbuild bundling.
 * DATABASE_URL injected by Neon. All entitlement checks server-side.
 */
import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Inline the ext-apps constants to avoid bundling issues
const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
import { ENTITLEMENT_STATES, PRICING, publicPricing } from "../pricing.js";
import widgetHtml from "../data/widget-html.js";
import catalog from "../data/catalog.json";
import widgetLocales from "../data/widget-locales.json";
import localizationBundle from "../data/localizations-bundle.js";

// ── Entitlement client (production: calls entitlement function) ──────────
const ENTITLEMENT_BASE = String(process.env.POLYGLOT_ENTITLEMENT_ENDPOINT || "").replace(/\/$/, "");

function authToken(extra) {
  return extra?.authInfo?.token || extra?.authInfo?.accessToken || "";
}

async function getEntitlement(extra) {
  if (!ENTITLEMENT_BASE) {
    // No remote endpoint — fail closed in production
    if (process.env.NODE_ENV === "production") throw new Error("POLYGLOT_ENTITLEMENT_ENDPOINT required in production");
    // Dev fallback: not_started
    const base = { state: ENTITLEMENT_STATES.NOT_STARTED, userId: null, trialStartedAt: null, trialEndsAt: null, source: "dev-fallback" };
    return { ...base, isPro: false, trialActive: false, canUseFree: true, pricing: publicPricing() };
  }
  const token = authToken(extra);
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${ENTITLEMENT_BASE}/v1/entitlements/me`, { headers });
  if (!res.ok) throw new Error(`Entitlement service returned ${res.status}`);
  const data = await res.json();
  const isPro = data.state === ENTITLEMENT_STATES.PRO_MONTHLY || data.state === ENTITLEMENT_STATES.PRO_ANNUAL;
  const trialActive = data.state === ENTITLEMENT_STATES.TRIAL && (!data.trialEndsAt || Date.now() < Date.parse(data.trialEndsAt));
  const canUseFree = data.state === ENTITLEMENT_STATES.NOT_STARTED || trialActive || isPro;
  return { ...data, isPro, trialActive, canUseFree, pricing: publicPricing() };
}

async function startTrialIfNeeded(extra) {
  if (!ENTITLEMENT_BASE) return getEntitlement(extra);
  const token = authToken(extra);
  // Anonymous users can use free templates without starting trial
  if (!token) return getEntitlement(extra);
  const headers = { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` };
  const res = await fetch(`${ENTITLEMENT_BASE}/v1/trials/start`, { method: "POST", headers, body: JSON.stringify({ trialDays: PRICING.trialDays }) });
  if (!res.ok) {
    // If trial start fails, fall back to current entitlement (don't crash)
    console.error(`Trial start failed: ${res.status}`);
    return getEntitlement(extra);
  }
  const data = await res.json();
  const isPro = data.state === ENTITLEMENT_STATES.PRO_MONTHLY || data.state === ENTITLEMENT_STATES.PRO_ANNUAL;
  const trialActive = data.state === ENTITLEMENT_STATES.TRIAL && (!data.trialEndsAt || Date.now() < Date.parse(data.trialEndsAt));
  const canUseFree = data.state === ENTITLEMENT_STATES.NOT_STARTED || trialActive || isPro;
  return { ...data, isPro, trialActive, canUseFree, pricing: publicPricing() };
}

function templateAccess(template, entitlement) {
  if (entitlement.isPro) return { allowed: true, locked: false, reason: null };
  if (template.plan === "free" && entitlement.canUseFree) return { allowed: true, locked: false, reason: null };
  if (template.plan === "pro") return { allowed: false, locked: true, reason: "pro_required" };
  return { allowed: false, locked: true, reason: entitlement.state === ENTITLEMENT_STATES.EXPIRED ? "trial_expired" : "subscription_required" };
}

function entitlementSummary(entitlement) {
  const { state, trialEndsAt, pricing } = entitlement;
  return { state, trialEndsAt, isPro: entitlement.isPro, trialActive: entitlement.trialActive, canUseFree: entitlement.canUseFree, pricing };
}

// ── Localization (bundled, no fs reads) ──────────────────────────────────
const SUPPORTED_LANGUAGES = [
  ["EN","English","🇺🇸"],["ES","Spanish","🇪🇸"],["FR","French","🇫🇷"],["DE","German","🇩🇪"],
  ["IT","Italian","🇮🇹"],["PT","Portuguese","🇧🇷"],["NL","Dutch","🇳🇱"],["RU","Russian","🇷🇺"],
  ["ZH","Chinese (Simplified)","🇨🇳"],["ZH_TW","Chinese (Traditional)","🇹🇼"],["JA","Japanese","🇯🇵"],["KO","Korean","🇰🇷"],
  ["AR","Arabic","🇸🇦"],["HI","Hindi","🇮🇳"],["BN","Bengali","🇧🇩"],["TR","Turkish","🇹🇷"],
  ["PL","Polish","🇵🇱"],["SV","Swedish","🇸🇪"],["NO","Norwegian","🇳🇴"],["DA","Danish","🇩🇰"],
  ["FI","Finnish","🇫🇮"],["EL","Greek","🇬🇷"],["HE","Hebrew","🇮🇱"],["ID","Indonesian","🇮🇩"],
  ["MS","Malay","🇲🇾"],["TH","Thai","🇹🇭"],["VI","Vietnamese","🇻🇳"],["UK","Ukrainian","🇺🇦"],
  ["CS","Czech","🇨🇿"],["RO","Romanian","🇷🇴"],["HU","Hungarian","🇭🇺"],["SK","Slovak","🇸🇰"],
  ["HR","Croatian","🇭🇷"],["CA","Catalan","🇪🇸"],["AF","Afrikaans","🇿🇦"],["SW","Swahili","🇰🇪"],
  ["HA","Hausa","🇳🇬"],["AM","Amharic","🇪🇹"],
].map(([code,name,flag]) => Object.freeze({ code, name, flag }));

const byCode = new Map(SUPPORTED_LANGUAGES.map((x) => [x.code, x]));
const byName = new Map(SUPPORTED_LANGUAGES.map((x) => [x.name.toLowerCase(), x]));

function resolveLanguage(value, fallback = "EN") {
  if (!value) return byCode.get(fallback) ?? byCode.get("EN");
  const raw = String(value).trim();
  const normalized = raw.toUpperCase().replaceAll("-", "_");
  if (byCode.has(normalized)) return byCode.get(normalized);
  if (normalized === "ZH_TW" || normalized === "ZH_HANT") return byCode.get("ZH_TW");
  if (normalized === "ZH_CN" || normalized === "ZH_HANS") return byCode.get("ZH");
  return byName.get(raw.toLowerCase()) ?? byCode.get(fallback) ?? byCode.get("EN");
}

function languagePublicList() {
  return SUPPORTED_LANGUAGES.map(({ code, name, flag }) => ({ code, name, flag }));
}

function localizedTemplateMeta(template, uiLanguage = "EN") {
  const lang = resolveLanguage(uiLanguage);
  if (lang.code === "EN") return { name: template.name, description: template.desc };
  const translated = localizationBundle[lang.code]?.templates?.[template.name];
  return { name: translated?.n || template.name, description: translated?.d || template.desc };
}

function localizedFieldLabel(fieldKey, uiLanguage = "EN") {
  const lang = resolveLanguage(uiLanguage);
  if (lang.code === "EN") return String(fieldKey).replaceAll("_", " ");
  return localizationBundle[lang.code]?.fields?.[fieldKey] || String(fieldKey).replaceAll("_", " ");
}

function languageContext({ uiLanguage = "EN", inputLanguage = "EN", outputLanguage = "EN" } = {}) {
  const ui = resolveLanguage(uiLanguage);
  const input = resolveLanguage(inputLanguage, ui.code);
  const output = resolveLanguage(outputLanguage, ui.code);
  return { uiLanguage: ui, inputLanguage: input, outputLanguage: output, supportedCount: SUPPORTED_LANGUAGES.length };
}

function applyLanguageInstructions(prompt, inputLanguage, outputLanguage) {
  let body = String(prompt ?? "");
  const input = resolveLanguage(inputLanguage);
  const output = resolveLanguage(outputLanguage);
  if (input.code !== "EN") body += `\n\nThe user-provided field values may be written in ${input.name}. Interpret them faithfully and preserve their meaning.`;
  if (output.code !== "EN") body += `\n\nRespond entirely in ${output.name}.`;
  return body;
}

// ── Catalog ──────────────────────────────────────────────────────────────
const templates = catalog.templates;
const prompts = catalog.prompts;
const UI_URI = "ui://polyglot/workspace-v2.html";

const COMPARE_PROVIDERS = Object.freeze({
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  claude: { label: "Claude", url: "https://claude.ai/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/" },
  perplexity: { label: "Perplexity", url: "https://www.perplexity.ai/" },
  grok: { label: "Grok", url: "https://grok.com/" },
  copilot: { label: "Copilot", url: "https://copilot.microsoft.com/" },
  mistral: { label: "Mistral", url: "https://chat.mistral.ai/" },
  groq: { label: "Groq", url: "https://groq.com/" },
  duckduckgo: { label: "DuckDuckGo AI", url: "https://duckduckgo.com/?q=ai&ia=chat" },
});

function compareAccess(e) { return e.isPro || e.canUseFree; }
function compareLocked(e) {
  const message = "Compare Mode is unavailable because your Poly-Glot trial has ended. Subscribe to Pro Monthly ($9.99/month) or Pro Annual ($79.99/year) to continue.";
  return { structuredContent: { view: "compare_locked", message, entitlement: entitlementSummary(e) }, content: [{ type: "text", text: message }] };
}

const splitName = (name) => { const c = String(name ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim(); return c || String(name ?? "").trim(); };
const getPromptBody = (t) => prompts[t.name] ?? prompts[splitName(t.name)] ?? "";
const placeholders = (body) => [...new Set([...body.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]))];
const fieldsFor = (t, uiLang = "EN") => placeholders(getPromptBody(t)).map((key) => ({
  key, label: localizedFieldLabel(key, uiLang),
  defaultValue: Object.prototype.hasOwnProperty.call(t.vars ?? {}, key) ? String(t.vars[key] ?? "") : "",
}));

const publicTemplate = (t, e, uiLang = "EN") => {
  const access = templateAccess(t, e);
  const loc = localizedTemplateMeta(t, uiLang);
  return { id: t.name, name: loc.name, description: loc.description, goal: t.goal, plan: t.plan, fields: fieldsFor(t, uiLang), hasPrompt: Boolean(getPromptBody(t)), locked: access.locked, lockReason: access.reason };
};

const findTemplate = (name) => {
  const q = String(name ?? "").trim().toLowerCase();
  if (!q) return undefined;
  return templates.find((t) => t.name.toLowerCase() === q) ?? templates.find((t) => splitName(t.name).toLowerCase() === q);
};

const searchTemplates = ({ query = "", goal, plan, limit = 12, uiLanguage = "EN" }, e) => {
  const q = query.trim().toLowerCase();
  return templates.filter((t) => !goal || t.goal === goal).filter((t) => !plan || t.plan === plan)
    .map((t, index) => {
      const loc = localizedTemplateMeta(t, uiLanguage);
      const name = `${t.name} ${loc.name}`.toLowerCase();
      const desc = `${t.desc} ${loc.description}`.toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else { if (name === q) score += 100; if (name.startsWith(q)) score += 35; if (name.includes(q)) score += 20; if (desc.includes(q)) score += 8; for (const w of q.split(/\s+/).filter(Boolean)) { if (name.includes(w)) score += 5; if (desc.includes(w)) score += 2; } }
      return { t, score, index };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(Math.max(limit, 1), 24)).map(({ t }) => publicTemplate(t, e, uiLanguage));
};

const entitlementSchema = z.object({
  state: z.string(), trialEndsAt: z.string().nullable(), isPro: z.boolean(), trialActive: z.boolean(), canUseFree: z.boolean(),
  pricing: z.object({ currency: z.string(), trialDays: z.number(), freeTemplateCount: z.number(),
    monthly: z.object({ id: z.string(), label: z.string(), price: z.number(), interval: z.string() }),
    annual: z.object({ id: z.string(), label: z.string(), price: z.number(), interval: z.string(), savingsLabel: z.string() }) }),
});
const templateSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), goal: z.string(), plan: z.string(),
  fields: z.array(z.object({ key: z.string(), label: z.string(), defaultValue: z.string() })),
  hasPrompt: z.boolean(), locked: z.boolean(), lockReason: z.string().nullable(),
});
const languageSchema = z.object({ code: z.string(), name: z.string(), flag: z.string() });
const localizationSchema = z.object({ uiLanguage: languageSchema, inputLanguage: languageSchema, outputLanguage: languageSchema, supportedCount: z.number() });
const localizationArgs = { uiLanguage: z.string().max(80).optional().default("EN"), inputLanguage: z.string().max(80).optional().default("EN"), outputLanguage: z.string().max(80).optional().default("EN") };

function lockedResult(t, e, uiLang = "EN") {
  const reason = t.plan === "pro" ? "This is a Pro template. Subscribe to Pro Monthly ($9.99/month) or Pro Annual ($79.99/year) to unlock all 1,000+ templates." : "Your 3-day trial has ended. A Pro subscription is required to continue using templates.";
  return { structuredContent: { view: "locked", template: publicTemplate(t, e, uiLang), entitlement: entitlementSummary(e), message: reason }, content: [{ type: "text", text: reason }] };
}

// ── MCP Server factory ───────────────────────────────────────────────────
function createPolyglotServer() {
  const server = new McpServer(
    { name: "polyglot-ai-workspace", version: "1.3.0" },
    { instructions: "Use Poly-Glot AI Workspace to discover localized prompt templates, accept multilingual input, control AI output language, build finished prompts, and prepare Compare Mode runs across multiple AI providers. Respect server-returned locked states. Poly-Glot has a 3-day trial covering 25 free templates; Pro Monthly is $9.99/month and Pro Annual is $79.99/year. Premium access is enforced by the server." }
  );

  server.resource("polyglot-workspace", UI_URI, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml }],
  }));

  server.tool("get_language_options",
    "Return the 38 supported Poly-Glot UI, input, and AI output languages.",
    { uiLanguage: z.string().max(80).optional().default("EN") },
    async ({ uiLanguage = "EN" }) => {
    const ui = resolveLanguage(uiLanguage);
    const localization = languageContext({ uiLanguage: ui.code, inputLanguage: ui.code, outputLanguage: ui.code });
    return { structuredContent: { view: "languages", languages: languagePublicList(), localization }, content: [{ type: "text", text: `Poly-Glot supports ${languagePublicList().length} UI, input, and AI output languages.` }] };
  });

  server.tool("get_subscription_status",
    "Return the current Poly-Glot trial or Pro entitlement and current pricing.",
    {},
    async (_args, extra) => {
    const e = await getEntitlement(extra);
    return { structuredContent: { view: "subscription", entitlement: entitlementSummary(e) }, content: [{ type: "text", text: `Poly-Glot access: ${e.state}. Pro Monthly is $9.99/month; Pro Annual is $79.99/year.` }] };
  });

  server.tool("open_workspace",
    "Open the interactive Poly-Glot template browser and prompt editor.",
    { query: z.string().max(200).optional().default(""), uiLanguage: z.string().max(80).optional().default("EN") },
    async ({ query = "", uiLanguage = "EN" }, extra) => {
    const e = await getEntitlement(extra);
    const loc = languageContext({ uiLanguage, inputLanguage: uiLanguage, outputLanguage: uiLanguage });
    const results = searchTemplates({ query, limit: 12, uiLanguage: loc.uiLanguage.code }, e);
    return { structuredContent: { view: "search", query, results, entitlement: entitlementSummary(e), localization: loc }, content: [{ type: "text", text: `Opened Poly-Glot AI Workspace with ${results.length} template${results.length === 1 ? "" : "s"}.` }] };
  });

  server.tool("search_templates",
    "Find Poly-Glot prompt templates.",
    { query: z.string().max(200).optional().default(""), goal: z.string().max(80).optional(), plan: z.enum(["free", "pro"]).optional(), limit: z.number().int().min(1).max(24).optional().default(12), uiLanguage: z.string().max(80).optional().default("EN") },
    async ({ query = "", goal, plan, limit = 12, uiLanguage = "EN" }, extra) => {
    const e = await getEntitlement(extra);
    const loc = languageContext({ uiLanguage, inputLanguage: uiLanguage, outputLanguage: uiLanguage });
    const results = searchTemplates({ query, goal, plan, limit, uiLanguage: loc.uiLanguage.code }, e);
    return { structuredContent: { view: "search", query, results, entitlement: entitlementSummary(e), localization: loc }, content: [{ type: "text", text: results.length ? `Found ${results.length} Poly-Glot templates for "${query || "all templates"}".` : `No Poly-Glot templates matched "${query}".` }] };
  });

  server.tool("get_template",
    "Get a template's fields. Prompt body returned only when entitled.",
    { name: z.string().min(1).max(200), uiLanguage: z.string().max(80).optional().default("EN") },
    async ({ name, uiLanguage = "EN" }, extra) => {
    const t = findTemplate(name); if (!t) throw new Error(`Template not found: ${name}`);
    const e = await getEntitlement(extra);
    const loc = languageContext({ uiLanguage, inputLanguage: uiLanguage, outputLanguage: uiLanguage });
    const access = templateAccess(t, e);
    if (!access.allowed) { const lk = lockedResult(t, e, loc.uiLanguage.code); lk.structuredContent.localization = loc; return lk; }
    const base = publicTemplate(t, e, loc.uiLanguage.code);
    return { structuredContent: { view: "template", template: { ...base, promptTemplate: getPromptBody(t) }, entitlement: entitlementSummary(e), localization: loc }, content: [{ type: "text", text: `Opened "${t.name}". It has ${base.fields.length} prompt fields.` }] };
  });

  server.tool("build_prompt",
    "Fill an entitled Poly-Glot template. First free-template use starts the 3-day trial.",
    { name: z.string().min(1).max(200), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}), ...localizationArgs },
    async ({ name, values = {}, uiLanguage = "EN", inputLanguage = "EN", outputLanguage = "EN" }, extra) => {
    const t = findTemplate(name); if (!t) throw new Error(`Template not found: ${name}`);
    const loc = languageContext({ uiLanguage, inputLanguage, outputLanguage });
    let e = await getEntitlement(extra);
    let access = templateAccess(t, e);
    if (!access.allowed) { const lk = lockedResult(t, e, loc.uiLanguage.code); lk.structuredContent.localization = loc; return lk; }
    if (t.plan === "free" && e.state === "not_started") { e = await startTrialIfNeeded(extra); access = templateAccess(t, e); if (!access.allowed) { const lk = lockedResult(t, e, loc.uiLanguage.code); lk.structuredContent.localization = loc; return lk; } }
    let body = getPromptBody(t); if (!body) throw new Error(`No prompt body for: ${t.name}`);
    const defaults = t.vars ?? {};
    for (const key of placeholders(body)) { const s = values[key]; const v = s !== undefined && s !== null && String(s) !== "" ? String(s) : String(defaults[key] ?? ""); if (v) body = body.split(`{{${key}}}`).join(v); }
    const missing = placeholders(body);
    body = applyLanguageInstructions(body, loc.inputLanguage.code, loc.outputLanguage.code);
    return { structuredContent: { view: "prompt", name: localizedTemplateMeta(t, loc.uiLanguage.code).name, prompt: body, missingFields: missing, outputLanguage: loc.outputLanguage.name, inputLanguage: loc.inputLanguage.name, entitlement: entitlementSummary(e), localization: loc },
      content: [{ type: "text", text: missing.length ? `Built "${t.name}"; ${missing.length} fields unfilled: ${missing.join(", ")}.` : `Built the completed "${t.name}" prompt.` }, { type: "text", text: body }] };
  });

  server.tool("prepare_compare",
    "Prepare one canonical prompt for 2+ AI providers to compare answers.",
    { name: z.string().min(1).max(200).optional(), prompt: z.string().min(1).max(30000).optional(), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}), ...localizationArgs, providers: z.array(z.enum(["chatgpt","claude","gemini","perplexity","grok","copilot","mistral","groq","duckduckgo"])).min(2).max(9).optional().default(["chatgpt","claude"]) },
    async ({ name, prompt, values = {}, uiLanguage = "EN", inputLanguage = "EN", outputLanguage = "EN", providers = ["chatgpt","claude"] }, extra) => {
    if (!name && !prompt) throw new Error("Provide either a template name or a prompt.");
    const loc = languageContext({ uiLanguage, inputLanguage, outputLanguage });
    let e = await getEntitlement(extra);
    if (e.state === "not_started") e = await startTrialIfNeeded(extra);
    if (!compareAccess(e)) { const lk = compareLocked(e); lk.structuredContent.localization = loc; return lk; }
    let cp = String(prompt || "").trim(); let sourceTemplate;
    if (name) {
      const t = findTemplate(name); if (!t) throw new Error(`Template not found: ${name}`);
      const access = templateAccess(t, e);
      if (!access.allowed) { const lk = lockedResult(t, e, loc.uiLanguage.code); lk.structuredContent.localization = loc; return lk; }
      sourceTemplate = t.name; cp = getPromptBody(t); if (!cp) throw new Error(`No prompt body for: ${t.name}`);
      const defaults = t.vars ?? {};
      for (const key of placeholders(cp)) { const s = values[key]; const v = s !== undefined && s !== null && String(s) !== "" ? String(s) : String(defaults[key] ?? ""); if (v) cp = cp.split(`{{${key}}}`).join(v); }
    }
    cp = applyLanguageInstructions(cp, loc.inputLanguage.code, loc.outputLanguage.code);
    const unique = [...new Set(providers)]; const targets = unique.map((id) => ({ id, ...COMPARE_PROVIDERS[id] }));
    return { structuredContent: { view: "compare", prompt: cp, sourceTemplate, providers: targets, instructions: "Use exactly the same canonical prompt with each selected AI, collect the responses, then compare them side by side.", entitlement: entitlementSummary(e), localization: loc },
      content: [{ type: "text", text: `Compare Mode prepared for ${targets.map((x) => x.label).join(", ")}.` }, { type: "text", text: cp }] };
  });

  return server;
}

// ── Hono app (Neon Function export) ──────────────────────────────────────
const mcpServer = createPolyglotServer();
const transport = new StreamableHTTPTransport();

const app = new Hono();

app.get("/", (c) => c.json({
  name: "Poly-Glot AI Workspace MCP", status: "ok", endpoint: "/mcp",
  templates: templates.length, freeTemplates: templates.filter((t) => t.plan === "free").length,
  supportedLanguages: languagePublicList().length, pricing: publicPricing(),
}));

app.all("/mcp", async (c) => {
  if (!mcpServer.isConnected()) await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default app;
