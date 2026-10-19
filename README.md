# Poly-Glot AI Workspace

> 15 MCP tools · 1,022 prompt templates · 38 languages · 8 AI providers · Compare Mode · BYOM · Embedded GUI

**Directory listing facts:** Poly-Glot AI Workspace provides **15 MCP tools**, **38 languages**, and **1,022 templates**. Its eight built-in AI providers are **ChatGPT, Claude, Gemini, Grok, Perplexity, Mistral, HuggingChat, and DuckDuckGo AI**. **Groq is not a built-in provider**. The server uses remote Streamable HTTP; tools include prompt discovery and building, AI comparison preparation, BYOM, audio transcription, translation, and localization. Glama and MCP.so should use these current facts instead of outdated seven-tool or 35-language summaries.

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

Return the current verified Apple subscription or unexpired legacy trial state, feature locks, and reference pricing. This is the authoritative MCP-facing explanation of the user's access. Does not start the trial.

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

Fill and Send an entitled Poly-Glot template. **This is a Send action:** it requires a verified Apple subscription (including an Apple-authorized introductory offer) or an existing unexpired legacy trial. MCP cannot start a paid trial.

**Parameters:** `name` (string, required), `values` (object), `uiLanguage`, `inputLanguage`, `outputLanguage` (strings, default "EN") · **Send action** · Requires active entitlement · Does not start billing or a trial

### `prepare_compare`

Prepare one canonical prompt for 2+ AI providers so the user can compare answers side-by-side. **This is a Send action:** it requires an active Apple subscription or an unexpired legacy trial. MCP cannot start an Apple trial. Does not call third-party models on the user's behalf.

**Parameters:** `name` (string), `prompt` (string), `values` (object), `providers` (array of "chatgpt" | "claude" | "gemini" | "perplexity" | "grok" | "mistral" | "huggingchat" | "duckduckgo", min 2), `uiLanguage`, `inputLanguage`, `outputLanguage` · **Send action** · Requires active entitlement · Does not start billing or a trial

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

**Parameters:** `prompt` (string, required), `builtinProviders` (array), `customModels` (array of { label, adapterMode, baseUrl/endpoint, model }), `uiLanguage`, `inputLanguage`, `outputLanguage` · **Send action** · Requires active entitlement; never starts trial

### `transcribe_audio`

Transcribe audio content and return text. Supports language detection. Requires active trial or Pro.

**Parameters:** `audioUrl` (string), `audioBase64` (string), `filename`, `mimeType`, `languageHint`, `prompt`, `detectLanguage` (boolean)

### `detect_language`

Detect the language of a text snippet and map it to a supported Poly-Glot language. Requires active trial or Pro.

**Parameters:** `text` (string, required)

### `translate_text`

Translate text between any of the 38 supported Poly-Glot languages. Requires active trial or Pro.

**Parameters:** `text` (string, required), `sourceLanguage` (string), `targetLanguage` (string, required)

### `localize_text`

Localize text for a target locale — adapts tone, units, date formats, and cultural references beyond simple translation. Requires active trial or Pro.

**Parameters:** `text` (string, required), `targetLanguage` (string, required), `locale` (string), `audience` (string), `tone` (string)

## Pricing and access

Poly-Glot offers approved Apple subscriptions with an eligible **3-day introductory free trial**. The user must explicitly authorize the subscription with Apple; a prior app-managed trial or first MCP Send never starts a paid subscription. If eligible, the subscription renews at the chosen regular price after the trial unless canceled in Apple subscription settings.

- **Eligible Apple introductory offer** — 3 days of full access after authorizing Pro Monthly or Pro Annual in the app; Apple determines eligibility.
- **Existing, unexpired legacy app trial** — access continues until its previously established expiration. Its expiration alone cannot charge the user.
- **Without a valid entitlement** — templates, Ask Any AI, Compare Mode, History, Export and other premium workspace functions are locked. Historical user data is preserved.
- **Pro Monthly** — $9.99/month for full access, renewing unless canceled.
- **Pro Annual** — $79.99/year for full access, renewing unless canceled.


## Features

- **1,022 prompt templates** — historical catalog tags retained for compatibility; all templates now require an active entitlement
- **38 languages** — independent UI, input, and output language controls
- **Compare Mode** — same prompt across ChatGPT, Claude, Gemini, Perplexity, Grok, Mistral, HuggingChat, and DuckDuckGo AI
- **Bring Your Own Model (BYOM)** — connect OpenAI-compatible or custom REST HTTPS endpoints; credentials transient, never persisted
- **Embedded GUI** — interactive workspace widget in ChatGPT and MCP Apps-capable hosts
- **Server-side entitlements** — Apple-backed subscription verification via Neon Postgres

### Entitlement tiers

| Feature | No verified entitlement | Eligible Apple-introductory Pro trial | Existing unexpired legacy trial | Active Pro |
|---|---|---|---|---|
| Language discovery and read-only tool metadata | ✅ | ✅ | ✅ | ✅ |
| Entitlement status (signed-in account) | ✅ | ✅ | ✅ | ✅ |
| Templates and protected prompt bodies | ❌ Locked | ✅ | ✅ | ✅ |
| Build or send prompts | ❌ Locked | ✅ | ✅ | ✅ |
| 🔀 Compare Mode | ❌ Locked | ✅ | ✅ | ✅ |
| Language processing tools | ❌ Locked | ✅ | ✅ | ✅ |
| BYOM execution | ❌ Locked | ✅ | ✅ | ✅ |

**The app is free to download, but there is no post-trial daily free Send or free-template allowance.** The eligible Apple subscription introductory offer lasts three days and automatically renews into the selected monthly or annual plan unless the customer cancels. Apple displays the actual storefront price before authorization. Existing app-managed trials are honored until their original expiry but **cannot create paid charges** without a separate Apple-approved purchase.

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
