# Poly-Glot AI Workspace

> Multilingual MCP tool platform: 1,000+ prompt templates · 35 languages · Compare Mode · BYOM · Embedded GUI

Remote MCP server with an embedded MCP Apps / ChatGPT Apps SDK GUI, server-side entitlements, Apple-backed subscriptions, and Bring Your Own Model (BYOM) support.

## MCP Endpoint

```
https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp
```

Transport: **Streamable HTTP** · Distribution: **Hosted remote MCP** (no local package installation required)

## Tools (15)

### `get_language_options`

Return the supported Poly-Glot UI, input, and AI output languages. Language selection never changes entitlement and does not start the trial.

**Parameters:** `uiLanguage` (string, default "EN") · **Read-only** · Does not consume a send

### `get_subscription_status`

Return the current Poly-Glot entitlement state, trial status, daily free send allowance, feature locks, and pricing. This is the authoritative MCP-facing explanation of the user's access. Does not start the trial.

**Parameters:** none · **Read-only** · Does not consume a send

### `open_workspace`

Open the interactive Poly-Glot template browser and prompt editor with subscription-aware locked states. Browsing does not start the trial or consume a send.

**Parameters:** `query` (string), `uiLanguage` (string, default "EN") · **Read-only** · Does not consume a send

### `search_templates`

Find Poly-Glot prompt templates by keyword, goal, or plan. Results include whether each template is currently locked for the account. Searching does not start the trial or consume a send.

**Parameters:** `query` (string), `goal` (string), `plan` ("free" | "pro"), `limit` (1–24, default 12), `uiLanguage` (string, default "EN") · **Read-only** · Does not consume a send

### `get_template`

Get a template's fields and prompt body. The source prompt body is returned only when the account is entitled. Opening a template does not start the trial or consume a send.

**Parameters:** `name` (string, required), `uiLanguage` (string, default "EN") · **Read-only** · Does not consume a send

### `build_prompt`

Fill and Send an entitled Poly-Glot template. **This is a Send action:** it starts the 3-day free trial on first use if the user has not sent before. Pro templates require an active trial or Pro subscription.

**Parameters:** `name` (string, required), `values` (object), `uiLanguage`, `inputLanguage`, `outputLanguage` (strings, default "EN") · **Send action** · Consumes a send · Starts trial on first use

### `prepare_compare`

Prepare one canonical prompt for 2+ AI providers so the user can compare answers side-by-side. **This is a Send action:** it starts the 3-day free trial on first use. Compare Mode requires an active trial or Pro subscription. Does not call third-party models on the user's behalf.

**Parameters:** `name` (string), `prompt` (string), `values` (object), `providers` (array of "chatgpt" | "claude" | "gemini" | "perplexity" | "grok" | "copilot" | "mistral", min 2), `uiLanguage`, `inputLanguage`, `outputLanguage` · **Send action** · Consumes a send · Starts trial on first use

### `get_custom_model_capabilities`

Return supported BYOM adapter modes, credential policy, network restrictions, and notes about localhost access.

**Parameters:** none · **Read-only** · Does not consume a send

### `validate_custom_model`

Validate a developer-supplied model endpoint. Checks HTTPS, SSRF, and optionally probes the model. API keys are transient and never persisted or echoed. Requires active trial or Pro.

**Parameters:** `adapterMode` ("openai-compatible" | "custom-rest"), `baseUrl` (string), `endpoint` (string), `model` (string), `apiKey` (string, transient), `probe` (boolean) · **Read-only** · Does not consume a send

### `run_custom_model`

Run a Poly-Glot prompt against a developer-supplied model endpoint. Applies language instructions and respects entitlement checks. Requires active trial or Pro.

**Parameters:** `adapterMode` ("openai-compatible" | "custom-rest"), `baseUrl`/`endpoint` (string), `model` (string), `apiKey` (string, transient), `prompt` (string, required), `system` (string), `temperature`, `maxTokens`, `uiLanguage`, `inputLanguage`, `outputLanguage` · **Send action** · Consumes a send

### `prepare_custom_compare`

Build a Compare Mode plan containing built-in providers and developer-supplied custom model descriptors. Credentials are supplied at execution time only. **This is a Send action.**

**Parameters:** `prompt` (string, required), `builtinProviders` (array), `customModels` (array of { label, adapterMode, baseUrl/endpoint, model }), `uiLanguage`, `inputLanguage`, `outputLanguage` · **Send action** · Starts trial on first use

### `transcribe_audio`

Transcribe audio content and return text. Supports language detection. Requires active trial or Pro.

**Parameters:** `audioUrl` (string), `audioBase64` (string), `filename`, `mimeType`, `languageHint`, `prompt`, `detectLanguage` (boolean)

### `detect_language`

Detect the language of a text snippet and map it to a supported Poly-Glot language. Requires active trial or Pro.

**Parameters:** `text` (string, required)

### `translate_text`

Translate text between any of the 35 supported Poly-Glot languages. Requires active trial or Pro.

**Parameters:** `text` (string, required), `sourceLanguage` (string), `targetLanguage` (string, required)

### `localize_text`

Localize text for a target locale — adapts tone, units, date formats, and cultural references beyond simple translation. Requires active trial or Pro.

**Parameters:** `text` (string, required), `targetLanguage` (string, required), `locale` (string), `audience` (string), `tone` (string)

## Pricing and access

Try Poly-Glot free for 3 days. Your trial starts when you first Send and includes full access to 1,000+ templates, Compare Mode, and unlimited sends. After the trial, you get 1 free send per day using Ask Any AI or a free template. Pro templates, Compare Mode, and unlimited sends require Poly-Glot Pro: $9.99/month or $79.99/year. **The 3-day trial does not automatically convert to a paid subscription.**

- **3-day free trial** — starts on first Send. Full access to all 1,000+ templates, Compare Mode, unlimited sends, BYOM, and language tools.
- **After trial** — 1 free send per day using Ask Any AI or a free template. Pro templates, Compare Mode, and unlimited sends are locked.
- **Pro Monthly** — $9.99/month for unlimited access.
- **Pro Annual** — $79.99/year (Save 33%) for unlimited access.

## Features

- **1,022 prompt templates** — 25 designated Free, 997 designated Pro; all 1,022 are unlocked during the active trial
- **35 languages** — independent UI, input, and output language controls
- **Compare Mode** — same prompt across ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot, Mistral
- **Bring Your Own Model (BYOM)** — connect OpenAI-compatible or custom REST HTTPS endpoints; credentials transient, never persisted
- **Embedded GUI** — interactive workspace widget in ChatGPT and MCP Apps-capable hosts
- **Server-side entitlements** — Apple-backed subscription verification via Neon Postgres

### Entitlement tiers

| Feature | Pre-Trial | Trial (3 days) | Free (post-trial) | Pro |
|---|---|---|---|---|
| Browse & search templates | ✅ | ✅ | ✅ | ✅ |
| Language options & status | ✅ | ✅ | ✅ | ✅ |
| BYOM capabilities info | ✅ | ✅ | ✅ | ✅ |
| Free template bodies | ✅ | ✅ | ✅ (via daily send) | ✅ |
| Pro template bodies | ❌ | ✅ | ❌ Locked | ✅ |
| Send (build_prompt) | ✅ starts trial | ✅ Unlimited | ✅ 1/day | ✅ Unlimited |
| 🔀 Compare Mode | ✅ starts trial | ✅ | ❌ Locked | ✅ |
| Language processing tools | ❌ | ✅ | ❌ Locked | ✅ |
| BYOM execution | ❌ | ✅ | ❌ Locked | ✅ |

> **Note:** The 3-day trial is app/MCP-managed. It does not automatically become a paid Apple subscription. There is no automatic charge when the trial expires. A paid subscription begins only when the user explicitly completes the Apple subscription purchase flow.

## Distribution

Poly-Glot is a **hosted remote MCP server**. No npm, PyPI, or OCI package installation is required. Connect to the endpoint URL above from any Streamable HTTP MCP client.

## Endpoints

| Surface | URL |
|---|---|
| MCP (Streamable HTTP) | `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp` |
| Health | `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/` |
| Entitlement API | `https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech/` |

## Connect

Add this URL as a remote MCP server in any MCP-compatible client:

```
https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp
```

Works with: **ChatGPT** (with GUI) · **Claude** · **Goose** · **Cursor** · any Streamable HTTP MCP client

## Local development

```bash
npm install
npm run sync
npm run check
npm start
```

Local MCP endpoint: `http://localhost:8787/mcp`

## Links

- [Website](https://poly-glot.ai)
- [Mac App Store](https://apps.apple.com/us/app/poly-glot-ai-workspace/id6804499285?mt=12)
- [Hugging Face](https://huggingface.co/spaces/HWM2/poly-glot-ai-workspace)
- [Support](https://poly-glot.ai/support.html)
