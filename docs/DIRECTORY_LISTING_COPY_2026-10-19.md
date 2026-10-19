# Poly-Glot MCP — Current Directory Listing Copy

**Reviewed:** October 19, 2026. This is the current public listing text for MCP.so, Glama and other MCP directories. It does not authorize any directory changes on its own.

## Short description

Poly-Glot AI Workspace: 15 MCP tools, 1,022 prompt templates, 38 languages and 8 AI providers. Compare Mode, BYOM, translation and audio. Eligible 3-day Pro trial requires Apple subscription approval; no continuing free Sends.

## Detailed description (replace retired About and Overview)

Poly-Glot AI Workspace provides a hosted remote Streamable HTTP MCP server with **15 tools**, **1,022 prompt templates**, **38 supported languages**, and **eight built-in AI destinations**: ChatGPT, Claude, Gemini, Grok, Perplexity, Mistral, HuggingChat, and DuckDuckGo AI. Capabilities include template discovery, localized prompt building, comparison preparation, Bring Your Own Model (BYOM) endpoints, speech transcription, language detection, translation, localization, and subscription status. Compare Mode prepares prompts and destination instructions; it does not automatically execute all third-party AIs.

**Access:** The app is free to download. An eligible user explicitly authorizes an Apple Monthly or Annual subscription in the native app to begin the three-day Pro introductory trial. Unless canceled, Apple charges the displayed plan price when the trial ends and renews the subscription. MCP tools never initiate an Apple purchase or trial. Existing app-managed legacy trials do not generate paid charges without separate Apple subscription authorization. There is **no recurring post-trial free Send or free-template entitlement**. Read-only tool discovery may be available before subscription, while premium operations require verified entitlements.

**MCP transport:** Remote Streamable HTTP, not local stdio.

**Canonical endpoint:** `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp`

**Official registry ID:** `io.github.hmoses/poly-glot-ai-workspace`

**Repository:** https://github.com/hmoses/poly-glot-ai-workspace

**Documentation:** https://hmoses.github.io/poly-glot-site/mcp-integrations.html

## Tool inventory — 15 total

- Discovery/workspace (7): `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`.
- BYOM (4): `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`.
- Language/media (4): `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`.

## Fields to correct

**MCP.so:** About, Overview, tool count, provider names, removed provider tags, prices/free-tier descriptions, and cached tool summaries. Replace “7 MCP tools” with 15; “9 AI providers” with 8; remove Copilot and Groq. Remove “Free tier included,” post-trial free-Send offers, and first-Send trial activation. Live tool discovery already returned 15 tools on October 19; cached editorial text still requires owner edit. Open the listing and use **Claim**, sign in, and correct the listing. Avoid creating a duplicate server.

**Glama:** Connector description must say **38 languages**, not 35. Replace cached first-Send/automatic trial claims with Apple authorization language above. Refresh/rescan the connector's tool descriptions and schemas after the corrected server description is live. The linked official MCP Registry may overwrite local Glama title/description settings; claimed owners may select “Use Glama listing details as the source of truth” if they intend to manage copy directly. Preserve ownership and existing connector URL.

## Verification / publication boundary

As observed October 19, MCP function deployment 62 responded HTTP 200 and a `tools/list` call returned all 15 tools. The health endpoint reports 38 languages, no free-template entitlement, and Apple authorization for the trial. The source `server.json` has also been corrected.

**Do not claim the external pages are updated until their public About/Overview copy and cached tool descriptions visibly reflect these facts.** A GitHub source commit is not an MCP.so owner edit, a Glama admin edit, or an Official MCP Registry publication. No new MCP production deployment, registry version, or native app build is authorized merely by updating this document.
