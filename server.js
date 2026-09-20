/**
 * POLY-GLOT CROSS-CLIENT ARCHITECTURE NOTE
 *
 * This MCP server is intentionally client-agnostic. ChatGPT and Claude must
 * call the same tools and the same server-side entitlement checks. Never add
 * a client-specific shortcut that trusts an isPro/plan value supplied by a
 * widget, Skill, native app, or other caller. Premium prompt bodies are
 * released only after the entitlement module confirms access.
 */
/**
 * POLY-GLOT MCP SERVER
 * GOOSE NOTE: This is the security boundary exposed to ChatGPT.
 * Production runs in a production Node/MCP runtime on one public port. Preserve
 * every tool schema and entitlement check. Neon remains the database. Never
 * move Pro authorization into the browser/widget.
 */
import { createServer } from "node:http";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "./src/safe-ext-apps.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  entitlementSummary,
  getEntitlement,
  startTrialIfNeeded,
  templateAccess,
} from "./entitlements.js";
import { publicPricing } from "./pricing.js";
import { handleEntitlementRequest } from "./entitlement-service/server.js";
import { handleMetricsRequest } from "./metrics-api.js";
import {
  applyLanguageInstructions,
  languageContext,
  languagePublicList,
  localizedTemplateMeta,
  localizedFieldLabel,
  resolveLanguage,
} from "./localization.js";
import {
  customModelCapabilities,
  invokeOpenAICompatible,
  invokeCustomRest,
  validatePublicHttpsUrl,
  sanitizeError,
} from "./src/byom.js";

import { registerCrossPlatformTools } from "./src/cross-platform-tools.js";
import { randomUUID } from "node:crypto";
import {
  trackToolCall,
  analyticsContext,
  sanitizeRequestContext,
  recordRequestEvent,
  classifyTraffic,
  detectClient,
  extractReportedClient,
  isTestRun,
  ANALYTICS_VERSION,
} from "./analytics.js";
import { expandedTrack, recordError } from "./analytics-expansion.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
let widgetHtml, catalog;
try {
  widgetHtml = readFileSync(join(__dirname, "public", "workspace-widget.html"), "utf8");
  catalog = JSON.parse(readFileSync(join(__dirname, "data", "catalog.json"), "utf8"));
} catch {
  // Neon Functions: __dirname may not match /opt/function layout
  const { default: wh } = await import("./data/widget-html.js");
  const { default: cat } = await import("./data/catalog-bundle.js");
  widgetHtml = wh;
  catalog = cat;
}
const templates = catalog.templates;
const prompts = catalog.prompts;
const UI_URI = "ui://polyglot/workspace-v3.html";

// Shared Apps SDK metadata. The widget does not fetch remote assets or APIs;
// it talks to the MCP host bridge, so the CSP can stay intentionally tight.
const UI_META = Object.freeze({
  ui: {
    resourceUri: UI_URI,
    prefersBorder: true,
    csp: { connectDomains: [], resourceDomains: [] },
  },
  "openai/outputTemplate": UI_URI,
  "openai/widgetDescription": "Interactive Poly-Glot AI Workspace with template search, multilingual prompt building, subscription-aware states, and Compare Mode.",
});

const renderMeta = (invoking, invoked) => ({
  ...UI_META,
  "openai/toolInvocation/invoking": invoking,
  "openai/toolInvocation/invoked": invoked,
});

const COMPARE_PROVIDERS = Object.freeze({
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  claude: { label: "Claude", url: "https://claude.ai/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/" },
  perplexity: { label: "Perplexity", url: "https://www.perplexity.ai/" },
  grok: { label: "Grok", url: "https://grok.com/" },
  copilot: { label: "Copilot", url: "https://copilot.microsoft.com/" },
  mistral: { label: "Mistral", url: "https://chat.mistral.ai/" },
});

function compareAccess(entitlement) {
  // Compare Mode: Pro or active trial only. Locked after trial expires.
  return entitlement.isPro || entitlement.trialActive;
}

function compareLocked(entitlement) {
  const resetInfo = entitlement.nextResetAt ? ` Your next free send resets ${new Date(entitlement.nextResetAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.` : "";
  const message = `Compare Mode requires an active trial or Pro subscription. Poly-Glot Pro: $9.99/month or $79.99/year — unlocks Pro templates, Compare Mode, and unlimited sends.${resetInfo}`;
  return {
    structuredContent: {
      view: "compare_locked",
      message,
      entitlement: entitlementSummary(entitlement),
      upgrade: {
        monthly: "$9.99/month",
        annual: "$79.99/year",
        message: "Upgrade to Poly-Glot Pro for Pro templates, Compare Mode, and unlimited sends.",
        trialAutoConverts: false,
      },
    },
    content: [{ type: "text", text: message }],
  };
}

const splitName = (name) => {
  const cleaned = String(name ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return cleaned || String(name ?? "").trim();
};

const getPromptBody = (template) => prompts[template.name] ?? prompts[splitName(template.name)] ?? "";
const placeholders = (body) => [...new Set([...body.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]))];

const fieldsFor = (template, uiLanguage = "EN") => placeholders(getPromptBody(template)).map((key) => ({
  key,
  label: localizedFieldLabel(key, uiLanguage),
  defaultValue: Object.prototype.hasOwnProperty.call(template.vars ?? {}, key)
    ? String(template.vars[key] ?? "")
    : "",
}));

const publicTemplate = (template, entitlement, uiLanguage = "EN") => {
  const access = templateAccess(template, entitlement);
  const localized = localizedTemplateMeta(template, uiLanguage);
  return {
    // id is the stable English catalog key used for subsequent tool calls.
    // name/description are localized presentation strings.
    id: template.name,
    name: localized.name,
    description: localized.description,
    goal: template.goal,
    plan: template.plan,
    fields: fieldsFor(template, uiLanguage),
    hasPrompt: Boolean(getPromptBody(template)),
    locked: access.locked,
    lockReason: access.reason,
  };
};

const findTemplate = (name) => {
  const q = String(name ?? "").trim().toLowerCase();
  if (!q) return undefined;
  return templates.find((t) => t.name.toLowerCase() === q)
    ?? templates.find((t) => splitName(t.name).toLowerCase() === q);
};

const searchTemplates = ({ query = "", goal, plan, limit = 12, uiLanguage = "EN" }, entitlement) => {
  const q = query.trim().toLowerCase();
  return templates
    .filter((t) => !goal || t.goal === goal)
    .filter((t) => !plan || t.plan === plan)
    .map((t, index) => {
      const localized = localizedTemplateMeta(t, uiLanguage);
      const name = `${t.name} ${localized.name}`.toLowerCase();
      const desc = `${t.desc} ${localized.description}`.toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else {
        if (name === q) score += 100;
        if (name.startsWith(q)) score += 35;
        if (name.includes(q)) score += 20;
        if (desc.includes(q)) score += 8;
        for (const word of q.split(/\s+/).filter(Boolean)) {
          if (name.includes(word)) score += 5;
          if (desc.includes(word)) score += 2;
        }
      }
      return { t, score, index };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(Math.max(limit, 1), 24))
    .map(({ t }) => publicTemplate(t, entitlement, uiLanguage));
};

const entitlementSchema = z.object({
  state: z.string(), trialEndsAt: z.string().nullable(), isPro: z.boolean(), trialActive: z.boolean(), canUseFree: z.boolean(),
  compareLocked: z.boolean().optional(), nextResetAt: z.string().nullable().optional(),
  dailyFreeLimit: z.number().nullable().optional(),
  pricing: z.object({
    currency: z.string(), trialDays: z.number(), freeTemplateCount: z.number(),
    monthly: z.object({ id: z.string(), label: z.string(), price: z.number(), interval: z.string() }),
    annual: z.object({ id: z.string(), label: z.string(), price: z.number(), interval: z.string(), savingsLabel: z.string() }),
  }),
});

const templateSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), goal: z.string(), plan: z.string(),
  fields: z.array(z.object({ key: z.string(), label: z.string(), defaultValue: z.string() })),
  hasPrompt: z.boolean(), locked: z.boolean(), lockReason: z.string().nullable(),
});

function lockedResult(template, entitlement, uiLanguage = "EN") {
  const resetInfo = entitlement.nextResetAt ? ` Next free send resets ${new Date(entitlement.nextResetAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.` : "";
  const reason = entitlement.isExpired
    ? `Your 3-day trial has ended. You have 1 free send per day using Ask Any AI or a free template.${resetInfo} Pro templates, Compare Mode, and unlimited sends require Poly-Glot Pro: $9.99/month or $79.99/year.`
    : template.plan === "pro"
    ? "This is a Pro template. Subscribe to Poly-Glot Pro ($9.99/month or $79.99/year) to unlock Pro templates, Compare Mode, and unlimited sends."
    : "Your 3-day free trial starts when you first Send. Full access to all 1,000+ templates, Compare Mode, and unlimited sends during trial.";
  return {
    structuredContent: {
      view: "locked",
      template: publicTemplate(template, entitlement, uiLanguage),
      entitlement: entitlementSummary(entitlement),
      message: reason,
      upgrade: {
        monthly: "$9.99/month",
        annual: "$79.99/year",
        message: "Upgrade to Poly-Glot Pro for Pro templates, Compare Mode, and unlimited sends.",
        trialAutoConverts: false,
      },
    },
    content: [{ type: "text", text: reason }],
  };
}

const languageSchema = z.object({ code: z.string(), name: z.string(), flag: z.string() });
const localizationSchema = z.object({
  uiLanguage: languageSchema, inputLanguage: languageSchema, outputLanguage: languageSchema, supportedCount: z.number(),
});
const localizationArgs = {
  uiLanguage: z.string().max(80).optional().default("EN"),
  inputLanguage: z.string().max(80).optional().default("EN"),
  outputLanguage: z.string().max(80).optional().default("EN"),
};

function createPolyglotServer(requestAuthToken = "", reqCtx = {}) {
  // production host forwards the Authorization header on each Streamable HTTP
  // request. The MCP SDK does not guarantee that raw HTTP auth is copied into
  // extra.authInfo for a custom server, so we bind the verified bearer token
  // candidate to this request-scoped server instance. The entitlement API still
  // performs the actual JWT signature/issuer/audience verification.
  const entitlementContext = (extra) => ({
    ...(extra || {}),
    authInfo: {
      ...(extra?.authInfo || {}),
      token: extra?.authInfo?.token || extra?.authInfo?.accessToken || requestAuthToken || "",
    },
  });

  // ── Analytics helpers scoped to this request ────────────────────────
  // reqCtx carries sanitized HTTP context (userAgent, refererHost, originHost, requestKey)
  const track = (toolName, extra, metadata = {}) => {
    const ctx = trackToolCall(toolName, extra, requestAuthToken, metadata, reqCtx);
    return ctx;
  };
  const trackExpanded = (toolName, extra, entitlementState, metadata = {}) => {
    const ctx = analyticsContext(extra, requestAuthToken, reqCtx);
    expandedTrack({ toolName, ...ctx, entitlementState, metadata });
  };
  const trackErr = (toolName, error, extra) => {
    const ctx = analyticsContext(extra, requestAuthToken, reqCtx);
    recordError({
      toolName,
      errorType: error?.message || String(error),
      clientName: ctx.clientName,
      userKey: ctx.userKey,
      sessionKey: ctx.sessionKey,
      metadata: { requestKey: reqCtx.requestKey },
    });
  };
  const server = new McpServer(
    { name: "polyglot-ai-workspace", version: "1.10.0" },
    { instructions: "Use Poly-Glot AI Workspace to discover localized prompt templates, accept multilingual input, control AI output language, build finished prompts, prepare Compare Mode runs across multiple AI providers, and connect developer-supplied model endpoints via BYOM. Respect server-returned locked states. The 3-day free trial starts on the user's first Send and includes full access to all 1,000+ templates, Compare Mode, unlimited sends, and BYOM. After the trial, users get 1 free send per day using Ask Any AI or a free template. Pro templates, Compare Mode, and unlimited sends require Poly-Glot Pro: $9.99/month or $79.99/year. The trial does not automatically convert to a paid subscription. Premium access is enforced by the server. BYOM credentials are transient and never persisted." }
  );

  registerAppResource(server, "polyglot-workspace", UI_URI, { _meta: UI_META }, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml, _meta: UI_META }],
  }));

  registerAppTool(server, "get_language_options", {
    title: "Get Poly-Glot language options",
    description: "Return the supported Poly-Glot UI, input, and AI output languages. Language selection never changes entitlement and does not start the trial.",
    _meta: UI_META,
    inputSchema: { uiLanguage: z.string().max(80).optional().default("EN") },
    outputSchema: {
      view: z.literal("languages"),
      languages: z.array(languageSchema),
      localization: localizationSchema,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ uiLanguage = "EN" }, extra) => {
    track("get_language_options", extra, { uiLanguage });
    const ui = resolveLanguage(uiLanguage);
    const localization = languageContext({ uiLanguage: ui.code, inputLanguage: ui.code, outputLanguage: ui.code });
    return {
      structuredContent: { view: "languages", languages: languagePublicList(), localization },
      content: [{ type: "text", text: `Poly-Glot supports ${languagePublicList().length} UI, input, and AI output languages.` }],
    };
  });

  registerAppTool(server, "get_subscription_status", {
    title: "Get Poly-Glot subscription status",
    description: "Return the current Poly-Glot entitlement state, trial status, daily free send allowance, feature locks, and pricing. This is the authoritative MCP-facing explanation of the user's access. Does not start the trial.",
    _meta: UI_META,
    inputSchema: {},
    outputSchema: { view: z.literal("subscription"), entitlement: entitlementSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (_args, extra) => {
    track("get_subscription_status", extra);
    const entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("get_subscription_status", extra, entitlement.state);
    const summary = entitlementSummary(entitlement);
    // Map entitlement state to the canonical funnel status
    let status;
    if (entitlement.isPro) status = "pro";
    else if (entitlement.trialActive) status = "trialActive";
    else if (entitlement.isExpired) status = "free";
    else status = "preTrial";

    const enriched = {
      ...summary,
      status,
      trialStarted: entitlement.state !== "not_started",
      trialStart: entitlement.trialStartedAt || null,
      trialExpiresAt: entitlement.trialEndsAt || null,
      trialDays: 3,
      dailyFreeRemaining: entitlement.isExpired ? (entitlement.dailyFreeLimit ?? 1) : null,
      proTemplatesLocked: !(entitlement.isPro || entitlement.trialActive),
      unlimitedSends: entitlement.isPro || entitlement.trialActive,
      monthlyPrice: "$9.99",
      annualPrice: "$79.99",
      trialAutoConverts: false,
      purchaseRequired: true,
    };

    let text = `Poly-Glot access: ${status}.`;
    if (status === "preTrial") {
      text += ` Your 3-day free trial starts when you first Send. Full access to all 1,000+ templates, Compare Mode, and unlimited sends during trial. The trial does not automatically convert to a paid subscription.`;
    } else if (status === "trialActive") {
      text += ` Trial active — all features unlocked (all templates, Compare Mode, BYOM, unlimited sends). Ends ${entitlement.trialEndsAt ? new Date(entitlement.trialEndsAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "in 3 days"}. The trial does not automatically convert to a paid subscription.`;
    } else if (status === "free") {
      text += ` Trial ended. 1 free send per day using Ask Any AI or a free template. Pro templates, Compare Mode, and unlimited sends require Poly-Glot Pro: $9.99/month or $79.99/year.`;
    } else if (status === "pro") {
      text += ` Pro subscriber — all features unlocked. Pro Monthly $9.99/month; Pro Annual $79.99/year.`;
    }
    return {
      structuredContent: { view: "subscription", entitlement: enriched },
      content: [{ type: "text", text }],
    };
  });

  registerAppTool(server, "open_workspace", {
    title: "Open Poly-Glot AI Workspace",
    description: "Open the interactive Poly-Glot template browser and prompt editor with subscription-aware locked states. Browsing does not start the trial or consume a send.",
    _meta: UI_META,
    inputSchema: { query: z.string().max(200).optional().default(""), uiLanguage: z.string().max(80).optional().default("EN") },
    outputSchema: { view: z.literal("search"), query: z.string(), results: z.array(templateSchema), entitlement: entitlementSchema, localization: localizationSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: renderMeta("Opening Poly-Glot…", "Poly-Glot is ready"),
  }, async ({ query = "", uiLanguage = "EN" }, extra) => {
    track("open_workspace", extra, { query });
    const entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("open_workspace", extra, entitlement.state);
    const localization = languageContext({ uiLanguage, inputLanguage: uiLanguage, outputLanguage: uiLanguage });
    const results = searchTemplates({ query, limit: 12, uiLanguage: localization.uiLanguage.code }, entitlement);
    return {
      structuredContent: { view: "search", query, results, entitlement: entitlementSummary(entitlement), localization },
      content: [{ type: "text", text: `Opened Poly-Glot AI Workspace with ${results.length} template${results.length === 1 ? "" : "s"}.` }],
    };
  });

  registerAppTool(server, "search_templates", {
    title: "Search Poly-Glot templates",
    description: "Find Poly-Glot prompt templates. Results include whether each template is currently locked for this account. Searching does not start the trial or consume a send.",
    _meta: UI_META,
    inputSchema: {
      query: z.string().max(200).optional().default(""), goal: z.string().max(80).optional(),
      plan: z.enum(["free", "pro"]).optional(), limit: z.number().int().min(1).max(24).optional().default(12),
      uiLanguage: z.string().max(80).optional().default("EN"),
    },
    outputSchema: { view: z.literal("search"), query: z.string(), results: z.array(templateSchema), entitlement: entitlementSchema, localization: localizationSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: renderMeta("Searching templates…", "Templates updated"),
  }, async ({ query = "", goal, plan, limit = 12, uiLanguage = "EN" }, extra) => {
    track("search_templates", extra, { query, goal, plan });
    const entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("search_templates", extra, entitlement.state);
    trackExpanded("search_templates", extra, entitlement.state);
    const localization = languageContext({ uiLanguage, inputLanguage: uiLanguage, outputLanguage: uiLanguage });
    const results = searchTemplates({ query, goal, plan, limit, uiLanguage: localization.uiLanguage.code }, entitlement);
    return {
      structuredContent: { view: "search", query, results, entitlement: entitlementSummary(entitlement), localization },
      content: [{ type: "text", text: results.length ? `Found ${results.length} Poly-Glot templates for “${query || "all templates"}”.` : `No Poly-Glot templates matched “${query}”.` }],
    };
  });

  registerAppTool(server, "get_template", {
    title: "Open a Poly-Glot template",
    description: "Get a template's fields and prompt body. Opening a template does not start the trial or consume a send. The prompt body is returned only when the account is entitled.",
    _meta: UI_META,
    inputSchema: { name: z.string().min(1).max(200), uiLanguage: z.string().max(80).optional().default("EN") },
    outputSchema: {
      view: z.enum(["template", "locked"]),
      template: templateSchema.extend({ promptTemplate: z.string().optional() }),
      entitlement: entitlementSchema,
      localization: localizationSchema,
      message: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: renderMeta("Opening template…", "Template opened"),
  }, async ({ name, uiLanguage = "EN" }, extra) => {
    track("get_template", extra, { name });
    trackExpanded("get_template", extra);
    const template = findTemplate(name);
    if (!template) {
      const error = new Error(`Template not found: ${name}. Use search_templates to find available templates.`);
      error.code = "TEMPLATE_NOT_FOUND";
      throw error;
    }
    const entitlement = await getEntitlement(entitlementContext(extra));
    const localization = languageContext({ uiLanguage, inputLanguage: uiLanguage, outputLanguage: uiLanguage });
    const access = templateAccess(template, entitlement);
    if (!access.allowed) {
      const locked = lockedResult(template, entitlement, localization.uiLanguage.code);
      locked.structuredContent.localization = localization;
      return locked;
    }
    const base = publicTemplate(template, entitlement, localization.uiLanguage.code);
    const promptTemplate = getPromptBody(template);
    return {
      structuredContent: { view: "template", template: { ...base, promptTemplate }, entitlement: entitlementSummary(entitlement), localization },
      content: [{ type: "text", text: `Opened “${template.name}”. It has ${base.fields.length} prompt fields.` }],
    };
  });

  registerAppTool(server, "build_prompt", {
    title: "Build a Poly-Glot prompt",
    description: "Fill and Send an entitled Poly-Glot template. This is a Send action: it starts the 3-day free trial on first use if the user has not sent before. Pro templates require an active trial or Pro subscription.",
    _meta: UI_META,
    inputSchema: {
      name: z.string().min(1).max(200),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
      ...localizationArgs,
    },
    outputSchema: {
      view: z.enum(["prompt", "locked"]),
      name: z.string().optional(), prompt: z.string().optional(), missingFields: z.array(z.string()).optional(), outputLanguage: z.string().optional(), inputLanguage: z.string().optional(),
      template: templateSchema.optional(), message: z.string().optional(), entitlement: entitlementSchema, localization: localizationSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: renderMeta("Building prompt…", "Prompt is ready"),
  }, async ({ name, values = {}, uiLanguage = "EN", inputLanguage = "EN", outputLanguage = "EN" }, extra) => {
    track("build_prompt", extra, { name });
    const template = findTemplate(name);
    if (!template) {
      const error = new Error(`Template not found: ${name}. Use search_templates to find available templates.`);
      error.code = "TEMPLATE_NOT_FOUND";
      throw error;
    }
    const localization = languageContext({ uiLanguage, inputLanguage, outputLanguage });
    let entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("build_prompt", extra, entitlement.state);
    let access = templateAccess(template, entitlement);
    if (!access.allowed) {
      const locked = lockedResult(template, entitlement, localization.uiLanguage.code);
      locked.structuredContent.localization = localization;
      return locked;
    }

    if (template.plan === "free" && entitlement.state === "not_started") {
      entitlement = await startTrialIfNeeded(entitlementContext(extra));
      access = templateAccess(template, entitlement);
      if (!access.allowed) {
        const locked = lockedResult(template, entitlement, localization.uiLanguage.code);
        locked.structuredContent.localization = localization;
        return locked;
      }
    }

    let body = getPromptBody(template);
    if (!body) throw new Error(`No prompt body is available for template: ${template.name}`);
    const sourceFields = placeholders(body);
    const defaults = template.vars ?? {};
    for (const key of sourceFields) {
      const supplied = values[key];
      const value = supplied !== undefined && supplied !== null && String(supplied) !== "" ? String(supplied) : String(defaults[key] ?? "");
      if (value) body = body.split(`{{${key}}}`).join(value);
    }
    const missingFields = placeholders(body);
    body = applyLanguageInstructions(body, localization.inputLanguage.code, localization.outputLanguage.code);
    return {
      structuredContent: { view: "prompt", name: localizedTemplateMeta(template, localization.uiLanguage.code).name, prompt: body, missingFields, outputLanguage: localization.outputLanguage.name, inputLanguage: localization.inputLanguage.name, entitlement: entitlementSummary(entitlement), localization },
      content: [
        { type: "text", text: missingFields.length ? `Built “${template.name}”; ${missingFields.length} fields are still unfilled: ${missingFields.join(", ")}.` : `Built the completed “${template.name}” prompt.` },
        { type: "text", text: body },
      ],
    };
  });


  registerAppTool(server, "prepare_compare", {
    title: "Prepare Poly-Glot Compare Mode",
    description: "Prepare one canonical prompt for two or more AI providers so the user can compare answers. This is a Send action: it starts the 3-day free trial on first use. Compare Mode requires an active trial or Pro subscription. Never calls third-party models on the user's behalf.",
    _meta: UI_META,
    inputSchema: {
      name: z.string().min(1).max(200).optional(),
      prompt: z.string().min(1).max(30000).optional(),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
      ...localizationArgs,
      providers: z.array(z.enum(["chatgpt", "claude", "gemini", "perplexity", "grok", "copilot", "mistral"])).min(2).max(7).optional().default(["chatgpt", "claude"]),
    },
    outputSchema: {
      view: z.enum(["compare", "compare_locked", "locked"]),
      prompt: z.string().optional(),
      sourceTemplate: z.string().optional(),
      providers: z.array(z.object({ id: z.string(), label: z.string(), url: z.string() })).optional(),
      instructions: z.string().optional(),
      message: z.string().optional(),
      template: templateSchema.optional(),
      entitlement: entitlementSchema,
      localization: localizationSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: renderMeta("Preparing Compare Mode…", "Comparison is ready"),
  }, async ({ name, prompt, values = {}, uiLanguage = "EN", inputLanguage = "EN", outputLanguage = "EN", providers = ["chatgpt", "claude"] }, extra) => {
    if (!name && !prompt) throw new Error("Provide either a Poly-Glot template name or a prompt to compare.");
    const localization = languageContext({ uiLanguage, inputLanguage, outputLanguage });
    let entitlement = await getEntitlement(entitlementContext(extra));

    // First eligible Compare use starts the same three-day product trial.
    if (entitlement.state === "not_started") entitlement = await startTrialIfNeeded(entitlementContext(extra));
    if (!compareAccess(entitlement)) {
      const locked = compareLocked(entitlement);
      locked.structuredContent.localization = localization;
      return locked;
    }

    let canonicalPrompt = String(prompt || "").trim();
    let sourceTemplate;
    if (name) {
      const template = findTemplate(name);
      if (!template) {
        const error = new Error(`Template not found: ${name}. Use search_templates to find available templates.`);
        error.code = "TEMPLATE_NOT_FOUND";
        throw error;
      }
      const access = templateAccess(template, entitlement);
      if (!access.allowed) {
        const locked = lockedResult(template, entitlement, localization.uiLanguage.code);
        locked.structuredContent.localization = localization;
        return locked;
      }
      sourceTemplate = template.name;
      canonicalPrompt = getPromptBody(template);
      if (!canonicalPrompt) throw new Error(`No prompt body is available for template: ${template.name}`);
      const defaults = template.vars ?? {};
      for (const key of placeholders(canonicalPrompt)) {
        const supplied = values[key];
        const value = supplied !== undefined && supplied !== null && String(supplied) !== "" ? String(supplied) : String(defaults[key] ?? "");
        if (value) canonicalPrompt = canonicalPrompt.split(`{{${key}}}`).join(value);
      }
    }
    canonicalPrompt = applyLanguageInstructions(canonicalPrompt, localization.inputLanguage.code, localization.outputLanguage.code);

    const unique = [...new Set(providers)];
    const targets = unique.map((id) => ({ id, ...COMPARE_PROVIDERS[id] }));
    const instructions = "Use exactly the same canonical prompt with each selected AI, collect the responses, then compare them side by side. Poly-Glot does not silently call competing AI services or transmit account credentials.";
    return {
      structuredContent: { view: "compare", prompt: canonicalPrompt, sourceTemplate, providers: targets, instructions, entitlement: entitlementSummary(entitlement), localization },
      content: [
        { type: "text", text: `Compare Mode prepared for ${targets.map((x) => x.label).join(", ")}.` },
        { type: "text", text: canonicalPrompt },
      ],
    };
  });

  // ── BYOM: Bring Your Own Model tools (Pro capability) ───────────────

  server.registerTool("get_custom_model_capabilities", {
    title: "Get custom model capabilities",
    description: "Return supported BYOM adapter modes, credential policy, network restrictions, and notes about localhost access from the public remote MCP.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (_args, _extra) => {
    const caps = customModelCapabilities();
    return {
      structuredContent: { view: "byom_capabilities", ...caps },
      content: [{ type: "text", text: `BYOM supports ${caps.modes.join(", ")} adapter modes. Credentials are never persisted. ${caps.directLocalhostFromRemoteMcp ? "Direct localhost is reachable." : "Direct localhost/private endpoints are not reachable from the public remote MCP."}` }],
    };
  });

  server.registerTool("validate_custom_model", {
    title: "Validate a custom model endpoint",
    description: "Validate a developer-supplied model endpoint. Checks HTTPS, SSRF, and optionally probes the model with a minimal request. API keys are transient and never persisted or echoed.",
    inputSchema: {
      adapterMode: z.enum(["openai-compatible", "custom-rest"]),
      baseUrl: z.string().max(2000).optional(),
      endpoint: z.string().max(2000).optional(),
      model: z.string().max(200).optional().default(""),
      apiKey: z.string().max(2000).optional(),
      authMode: z.enum(["bearer", "api-key-header", "none"]).optional().default("bearer"),
      apiKeyHeader: z.string().max(100).optional().default("x-api-key"),
      promptField: z.string().max(100).optional().default("prompt"),
      systemField: z.string().max(100).optional().default("system"),
      responseTextPath: z.string().max(200).optional(),
      probe: z.boolean().optional().default(false),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args, extra) => {
    track("validate_custom_model", extra, { adapterMode: args.adapterMode });
    const entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("validate_custom_model", extra, entitlement.state);
    if (!entitlement.isPro && !entitlement.trialActive && entitlement.state !== "not_started") {
      const message = "Validating custom model endpoints requires an active trial or Pro subscription.";
      return {
        structuredContent: { view: "locked", message, entitlement: entitlementSummary(entitlement) },
        content: [{ type: "text", text: message }],
      };
    }

    const url = args.adapterMode === "openai-compatible" ? args.baseUrl : args.endpoint;
    if (!url) throw new Error("Provide baseUrl (openai-compatible) or endpoint (custom-rest).");

    try {
      await validatePublicHttpsUrl(url);
    } catch (err) {
      return {
        structuredContent: { view: "byom_validation", valid: false, error: err.message, adapterMode: args.adapterMode },
        content: [{ type: "text", text: `Validation failed: ${err.message}` }],
      };
    }

    let probeResult = null;
    if (args.probe) {
      try {
        if (args.adapterMode === "openai-compatible") {
          probeResult = await invokeOpenAICompatible({
            baseUrl: args.baseUrl, model: args.model || "test", apiKey: args.apiKey,
            prompt: "Respond with exactly: BYOM probe OK", timeoutMs: 15000,
          });
        } else {
          probeResult = await invokeCustomRest({
            endpoint: args.endpoint, apiKey: args.apiKey, authMode: args.authMode, apiKeyHeader: args.apiKeyHeader,
            prompt: "Respond with exactly: BYOM probe OK", promptField: args.promptField, systemField: args.systemField,
            responseTextPath: args.responseTextPath, timeoutMs: 15000,
          });
        }
      } catch (err) {
        return {
          structuredContent: { view: "byom_validation", valid: true, endpointReachable: true, probeSuccess: false, probeError: sanitizeError(err, [args.apiKey]), adapterMode: args.adapterMode },
          content: [{ type: "text", text: `Endpoint is valid HTTPS but probe failed: ${sanitizeError(err, [args.apiKey])}` }],
        };
      }
    }

    return {
      structuredContent: {
        view: "byom_validation", valid: true, endpointReachable: true,
        probeSuccess: probeResult ? true : null,
        probeText: probeResult?.text?.slice(0, 200) || null,
        adapterMode: args.adapterMode,
      },
      content: [{ type: "text", text: probeResult ? `Endpoint validated and probe returned: "${probeResult.text.slice(0, 200)}"` : "Endpoint validated. HTTPS and SSRF checks passed." }],
    };
  });

  server.registerTool("run_custom_model", {
    title: "Run a custom model",
    description: "Run a Poly-Glot prompt against a developer-supplied model endpoint. API keys are transient and never persisted. Respects Poly-Glot entitlement checks and applies language instructions.",
    inputSchema: {
      adapterMode: z.enum(["openai-compatible", "custom-rest"]),
      baseUrl: z.string().max(2000).optional(),
      endpoint: z.string().max(2000).optional(),
      model: z.string().max(200).optional().default(""),
      apiKey: z.string().max(2000).optional(),
      prompt: z.string().min(1).max(30000),
      system: z.string().max(10000).optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(128000).optional(),
      extraHeaders: z.record(z.string(), z.string()).optional().default({}),
      authMode: z.enum(["bearer", "api-key-header", "none"]).optional().default("bearer"),
      apiKeyHeader: z.string().max(100).optional().default("x-api-key"),
      promptField: z.string().max(100).optional().default("prompt"),
      systemField: z.string().max(100).optional().default("system"),
      responseTextPath: z.string().max(200).optional(),
      ...localizationArgs,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (args, extra) => {
    track("run_custom_model", extra, { adapterMode: args.adapterMode, model: args.model });
    const entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("run_custom_model", extra, entitlement.state);
    if (!entitlement.isPro && !entitlement.trialActive) {
      const message = "Running custom models requires an active trial or Pro subscription.";
      return {
        structuredContent: { view: "locked", message, entitlement: entitlementSummary(entitlement) },
        content: [{ type: "text", text: message }],
      };
    }

    const localization = languageContext({ uiLanguage: args.uiLanguage, inputLanguage: args.inputLanguage, outputLanguage: args.outputLanguage });
    const prompt = applyLanguageInstructions(args.prompt, localization.inputLanguage.code, localization.outputLanguage.code);

    try {
      let result;
      if (args.adapterMode === "openai-compatible") {
        if (!args.baseUrl) throw new Error("baseUrl is required for openai-compatible mode.");
        result = await invokeOpenAICompatible({
          baseUrl: args.baseUrl, model: args.model, apiKey: args.apiKey, prompt,
          system: args.system, temperature: args.temperature, maxTokens: args.maxTokens,
          extraHeaders: args.extraHeaders,
        });
      } else {
        if (!args.endpoint) throw new Error("endpoint is required for custom-rest mode.");
        result = await invokeCustomRest({
          endpoint: args.endpoint, apiKey: args.apiKey, authMode: args.authMode, apiKeyHeader: args.apiKeyHeader,
          prompt, system: args.system, promptField: args.promptField, systemField: args.systemField,
          responseTextPath: args.responseTextPath,
        });
      }

      return {
        structuredContent: {
          view: "custom_model_result", text: result.text, model: result.model,
          usage: result.usage, entitlement: entitlementSummary(entitlement), localization,
        },
        content: [
          { type: "text", text: `Custom model (${result.model || args.adapterMode}) response:` },
          { type: "text", text: result.text },
        ],
      };
    } catch (err) {
      const safeMsg = sanitizeError(err, [args.apiKey]);
      throw new Error(safeMsg);
    }
  });

  server.registerTool("prepare_custom_compare", {
    title: "Prepare custom Compare Mode",
    description: "Build a Compare Mode plan containing built-in Poly-Glot providers and developer-supplied custom model descriptors. Credentials are supplied only at execution time and are never embedded in the comparison plan.",
    inputSchema: {
      prompt: z.string().min(1).max(30000),
      builtinProviders: z.array(z.enum(["chatgpt", "claude", "gemini", "perplexity", "grok", "copilot", "mistral"])).optional().default([]),
      customModels: z.array(z.object({
        label: z.string().max(100),
        adapterMode: z.enum(["openai-compatible", "custom-rest"]),
        baseUrl: z.string().max(2000).optional(),
        endpoint: z.string().max(2000).optional(),
        model: z.string().max(200).optional(),
      })).min(1).max(5),
      ...localizationArgs,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (args, extra) => {
    track("prepare_custom_compare", extra, { customModels: (args.customModels||[]).length });
    let entitlement = await getEntitlement(entitlementContext(extra));
    trackExpanded("prepare_custom_compare", extra, entitlement.state);
    if (entitlement.state === "not_started") entitlement = await startTrialIfNeeded(entitlementContext(extra));
    if (!compareAccess(entitlement)) {
      const locked = compareLocked(entitlement);
      const localization = languageContext({ uiLanguage: args.uiLanguage, inputLanguage: args.inputLanguage, outputLanguage: args.outputLanguage });
      locked.structuredContent.localization = localization;
      return locked;
    }

    const localization = languageContext({ uiLanguage: args.uiLanguage, inputLanguage: args.inputLanguage, outputLanguage: args.outputLanguage });
    const canonicalPrompt = applyLanguageInstructions(args.prompt, localization.inputLanguage.code, localization.outputLanguage.code);

    const builtinTargets = [...new Set(args.builtinProviders || [])].map((id) => ({ id, type: "builtin", ...COMPARE_PROVIDERS[id] }));
    const customTargets = (args.customModels || []).map((m) => ({
      id: `custom:${m.label}`, type: "custom", label: m.label, adapterMode: m.adapterMode,
      baseUrl: m.baseUrl || undefined, endpoint: m.endpoint || undefined, model: m.model || undefined,
    }));
    const allTargets = [...builtinTargets, ...customTargets];

    if (allTargets.length < 2) throw new Error("Compare Mode requires at least two targets (built-in and/or custom models).");

    const instructions = "Use the canonical prompt with each target. For built-in providers, open the provider and paste the prompt. For custom models, use run_custom_model with the developer's transient credentials at execution time. Poly-Glot does not store or forward API keys in the comparison plan.";

    return {
      structuredContent: {
        view: "custom_compare_plan", prompt: canonicalPrompt,
        targets: allTargets, instructions,
        entitlement: entitlementSummary(entitlement), localization,
      },
      content: [
        { type: "text", text: `Custom Compare Mode prepared for ${allTargets.map((t) => t.label).join(", ")}.` },
        { type: "text", text: canonicalPrompt },
      ],
    };
  });

  // ── Cross-platform language tools (4 tools) ──────────────────────────
  registerCrossPlatformTools(server, {
    languagePublicList,
    resolveLanguage,
    languageContext,
    getEntitlement: (extra) => getEntitlement(entitlementContext(extra)),
    entitlementContext,
    entitlementSummary,
    track: async (toolName, metadata) => { track(toolName, {}, metadata); },
    trackError: async (toolName, error) => { trackErr(toolName, error, {}); },
  });

  return server;
}

const MCP_PATH = "/mcp";

// ── Exports for Neon Functions fetch handler (index.mjs) ──────────────
export { createPolyglotServer, templates, MCP_PATH };

// ── Local dev: Node HTTP server (skipped in Neon Functions) ───────────
if (process.env.NEON_FUNCTION) { /* Neon Functions uses index.mjs */ } else {
const port = Number(process.env.PORT ?? 8787);
const httpServer = createServer(async (req, res) => {
  if (!req.url) return res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    return res.end();
  }
  // the production runtime expose one public app port. Keep the MCP and
  // entitlement APIs on the same HTTPS origin and dispatch entitlement routes
  // before the MCP handler. This preserves one deployable container.
  if (url.pathname === "/v1/metrics/public") {
    return handleMetricsRequest(req, res);
  }
  if (url.pathname === "/healthz" || url.pathname.startsWith("/v1/")) {
    return handleEntitlementRequest(req, res);
  }

  if (req.method === "GET" && url.pathname === "/") {
    recordRequestEvent({ requestKey: randomUUID(), eventType: "health_check", method: "GET", path: "/", trafficClass: "health_check" }).catch(() => {});
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({
      name: "Poly-Glot AI Workspace MCP", status: "ok", version: "1.10.0", endpoint: MCP_PATH, templates: templates.length,
      freeTemplates: templates.filter((t) => t.plan === "free").length, supportedLanguages: languagePublicList().length, tools: 15, pricing: publicPricing(),
      trial: { days: 3, startsOn: "first Send", autoConverts: false },
    }));
  }
  if (url.pathname === MCP_PATH && req.method && ["POST", "GET", "DELETE"].includes(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const authHeader = String(req.headers.authorization || "");
    const requestAuthToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const reqCtx = {
      ...sanitizeRequestContext(req.headers),
      requestKey: randomUUID(),
      path: url.pathname,
      method: req.method,
    };
    recordRequestEvent({
      requestKey: reqCtx.requestKey,
      eventType: "mcp_request",
      method: req.method,
      path: url.pathname,
      trafficClass: classifyTraffic({ userAgent: reqCtx.userAgent, path: url.pathname, method: req.method, testRun: false, authenticated: Boolean(requestAuthToken) }),
      authenticated: Boolean(requestAuthToken),
      refererHost: reqCtx.refererHost,
      originHost: reqCtx.originHost,
    }).catch(() => {});
    const server = createPolyglotServer(requestAuthToken, reqCtx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }
  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => console.log(`Poly-Glot MCP listening on http://localhost:${port}${MCP_PATH}`));
}
