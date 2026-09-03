# Poly-Glot AI Workspace

> 1,000+ expert AI prompt templates · 38 languages · Compare Mode · Embedded GUI

Remote MCP server with an embedded MCP Apps / ChatGPT Apps SDK GUI, server-side entitlements, and Apple-backed subscriptions.

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

Fill an entitled Poly-Glot template with user values. First use of a free template starts the 3-day trial. Pro templates require an active Pro subscription.

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

## Features

- **1,022 prompt templates** — 25 Free, 997 Pro
- **38 languages** — independent UI, input, and output language controls
- **Compare Mode** — same prompt across ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot, Mistral
- **Embedded GUI** — interactive workspace widget in ChatGPT and MCP Apps-capable hosts
- **3-day free trial** — 25 free templates, no credit card required
- **Pro subscriptions** — $9.99/month or $79.99/year (Save 33%)
- **Server-side entitlements** — Apple-backed subscription verification via Neon Postgres

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
