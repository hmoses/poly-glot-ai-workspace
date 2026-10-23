# Poly-Glot MCP Distribution and Pricing — Current Audit

**Audited October 23, 2026.** This document supersedes the older October 9 snapshot and must distinguish owned source metadata from independent third-party directory copy.

## Canonical contract

| Field | Current contract |
|---|---|
| Server | Poly-Glot AI Workspace — remote Streamable HTTP MCP |
| MCP tools | 15: 7 core, 4 BYOM, 4 language/audio |
| Built-in AI destinations | 8: ChatGPT, Claude, Gemini, Grok, Perplexity, Mistral, HuggingChat, DuckDuckGo AI |
| Language options | 38 |
| Prompt templates | 1,022, access controlled by verified entitlement |
| Introductory trial | Eligible user explicitly approves an Apple Pro subscription in the native app; three days of access |
| Renewal | Selected monthly or annual plan renews unless canceled through Apple |
| US reference prices | $9.99/month or $79.99/year; Apple checkout controls actual storefront price and eligibility |
| Continuing free Sends / free-template entitlement | Zero: none after trial or without verified access |
| Existing legacy app trials | Unexpired grandfathered access may persist, but does not authorize Apple billing |
| MCP billing | MCP discovery, connections or tool calls cannot initiate Apple subscriptions |
| Comparison | `prepare_compare` prepares prompts and destination instructions; it does not call the built-in AI providers |

Production endpoint: `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp`.

## Current production deployment status

Read-only Neon inspection on **October 23, 2026** found both active **and** current deployments completed in project `small-fire-10422608`, default branch `br-steep-leaf-ae2o29qz`:

- **MCP function: deployment 66** — completed, active (Node.js 24).
- **Entitlements function: deployment 16** — completed, active (Node.js 24).

This establishes deployment status **only**. It does not independently verify an end-to-end Apple purchase/renewal/restore transaction, authenticated entitlement gating for all 15 tools, or every directory's public cached text. Never claim those untested paths are proven merely because deployments completed.

## External directories — editorial copy not synchronized automatically

| Surface | October 23 observation | Next action |
|---|---|---|
| [MCP.so](https://mcp.so/servers/poly-glot-ai-workspace) | Previously listed 15 tools dynamically; manually maintained descriptions may still show 7 tools or obsolete provider/pricing copy | Update claimed-owner About, summary, pricing and tool descriptions; verify public URL |
| [Glama remote connector](https://glama.ai/mcp/connectors/io.github.hmoses/poly-glot-ai-workspace) | Public cached description still says 35 languages, and cached tool description says first free template starts trial | Owner: correct to 38 and Apple-approved trial; rescan tool descriptions; verify visible page |
| [Glama GitHub-backed listing](https://glama.ai/mcp/servers/hmoses/poly-glot-ai-workspace) | GitHub-backed page may cache the older README pricing text despite current repo being corrected | Request listing refresh and inspect public result |
| [GitHub source](https://github.com/hmoses/poly-glot-ai-workspace) | README and subscription policy use correct Apple-authorized model | Preserve canonical contract and CI validations |
| [Website MCP page](https://hmoses.github.io/poly-glot-site/mcp-integrations.html) | Source describes 15 tools and current entitlement rules; the multilingual catalog included historical translation strings | Sync localized explanatory text and deploy/verify GitHub Pages |
| [Hugging Face Space](https://huggingface.co/spaces/HWM2/poly-glot-ai-workspace) | Not reverified in this audit | Review actual Space public copy and tool widget before claiming parity |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/) | `server.json` in GitHub is current; published registry version not reverified | Check registry live metadata; version/tag publish only if needed |

**Important:** Updating GitHub does not edit Glama/MCP.so owner-controlled fields, invalidate their stale caches, or publish a new Registry version. Do not mark those corrected before public verification.

## Tools

- Core: `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`.
- BYOM: `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`.
- Language/audio: `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`.

Never change live Apple entitlement verification, API authorization or MCP tool contracts merely to refresh public directory copy.
