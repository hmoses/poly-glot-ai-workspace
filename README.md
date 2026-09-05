# Poly-Glot AI Workspace

> Multilingual MCP tool platform: 1,000+ prompt templates · 38 languages · Compare Mode · BYOM · Embedded GUI

Remote MCP server with an embedded MCP Apps / ChatGPT Apps SDK GUI, server-side entitlements, Apple-backed subscriptions, and Bring Your Own Model (BYOM) support.

## MCP Endpoint

```
https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp
```

Transport: **Streamable HTTP**

## Tools

### `search_templates`

Find Poly-Glot prompt templates by keyword, goal, or plan. Results include whether each template is currently locked for the account.

**Parameters:** `query` (string), `goal` (string), `plan` ("free" | "pro"), `limit` (1–24, default 12), `uiLanguage` (string, default "EN")

### `get_template`

Get a template's fields and prompt body. The source prompt body is returned only when the account is entitled to use the template.

**Parameters:** `name` (string, required), `uiLanguage` (string, default "EN")

### `build_prompt`

Fill an entitled Poly-Glot template with user values. First eligible use starts the 3-day trial. During the active trial, all 1,000+ templates are unlocked; after the trial, template bodies lock unless the account is Pro.

**Parameters:** `name` (string, required), `values` (object), `uiLanguage`, `inputLanguage`, `outputLanguage` (strings, default "EN")

### `prepare_compare`

Prepare one canonical prompt for 2+ AI providers so the user can compare answers side-by-side. Does not call third-party models on the user's behalf.

**Parameters:** `name` (string), `prompt` (string), `values` (object), `providers` (array of "chatgpt" | "claude" | "gemini" | "perplexity" | "grok" | "copilot" | "mistral", min 2), `uiLanguage`, `inputLanguage`, `outputLanguage`

### `get_language_options`

Return the 38 supported Poly-Glot UI, input, and AI output languages. Language selection never changes entitlement.

**Parameters:** `uiLanguage` (string, default "EN")

### `get_subscription_status`

Return the current Poly-Glot trial or Pro entitlement state and current pricing.

**Parameters:** none

### `open_workspace`

Open the interactive Poly-Glot template browser and prompt editor with subscription-aware locked states. In UI-capable MCP hosts (ChatGPT), renders the full embedded GUI inside the conversation.

**Parameters:** `query` (string), `uiLanguage` (string, default "EN")

### `transcribe_audio`

Transcribe audio content and return text. Supports language detection and forced source language. Requires entitlement.

**Parameters:** `audioUrl` (string, required), `sourceLanguage` (string), `uiLanguage` (string, default "EN")

### `detect_language`

Detect the language of a text snippet. Returns ISO code and confidence score.

**Parameters:** `text` (string, required), `uiLanguage` (string, default "EN")

### `translate_text`

Translate text between any of the 38 supported Poly-Glot languages.

**Parameters:** `text` (string, required), `from` (string), `to` (string, required), `uiLanguage` (string, default "EN")

### `localize_text`

Localize text for a target locale — adapts tone, units, date formats, and cultural references beyond simple translation.

**Parameters:** `text` (string, required), `targetLocale` (string, required), `context` (string), `uiLanguage` (string, default "EN")

### `get_custom_model_capabilities`

Return supported BYOM adapter modes, credential policy, network restrictions, and notes about localhost access.

**Parameters:** none

### `validate_custom_model`

Validate a developer-supplied model endpoint. Checks HTTPS, SSRF, and optionally probes the model. API keys are transient and never persisted or echoed.

**Parameters:** `adapterMode` ("openai-compatible" | "custom-rest"), `baseUrl` (string), `endpoint` (string), `model` (string), `apiKey` (string, transient), `probe` (boolean)

### `run_custom_model`

Run a Poly-Glot prompt against a developer-supplied model endpoint. Applies language instructions and respects entitlement checks.

**Parameters:** `adapterMode` ("openai-compatible" | "custom-rest"), `baseUrl`/`endpoint` (string), `model` (string), `apiKey` (string, transient), `prompt` (string, required), `system` (string), `temperature`, `maxTokens`, `uiLanguage`, `inputLanguage`, `outputLanguage`

### `prepare_custom_compare`

Build a Compare Mode plan containing built-in providers and developer-supplied custom model descriptors. Credentials are supplied at execution time only.

**Parameters:** `prompt` (string, required), `builtinProviders` (array), `customModels` (array of { label, adapterMode, baseUrl/endpoint, model }), `uiLanguage`, `inputLanguage`, `outputLanguage`

## Pricing and access

- **3-day free trial** — full access to all 1,000+ templates, Compare Mode, unlimited sends, BYOM, and language tools.
- **After trial** — 1 free single-AI send per day; Compare Mode and premium features lock.
- **Pro Monthly** — $9.99/month for unlimited access.
- **Pro Annual** — $79.99/year (Save 33%) for unlimited access.

## Features

- **1,022 prompt templates** — 25 designated Free, 997 designated Pro; all 1,022 are unlocked during the active trial
- **38 languages** — independent UI, input, and output language controls
- **Compare Mode** — same prompt across ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot, Mistral
- **Bring Your Own Model (BYOM)** — connect OpenAI-compatible or custom REST HTTPS endpoints; credentials transient, never persisted
- **Embedded GUI** — interactive workspace widget in ChatGPT and MCP Apps-capable hosts
- **Server-side entitlements** — Apple-backed subscription verification via Neon Postgres

### Entitlement tiers

| Feature | Free / not started | Trial (3 days) | Expired (post-trial) | Pro |
|---|---|---|---|---|
| Browse & search templates | ✅ | ✅ | ✅ | ✅ |
| Language options & status | ✅ | ✅ | ✅ | ✅ |
| Template bodies | Free templates only | ✅ All | ❌ Locked | ✅ All |
| Send to 1 AI | ✅ starts trial | ✅ Unlimited | ✅ 1/day | ✅ Unlimited |
| 🔀 Compare Mode | ✅ starts trial | ✅ | ❌ | ✅ |
| Language processing | ❌ | ✅ | ❌ | ✅ |
| BYOM execution | ❌ | ✅ | ❌ | ✅ |

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
