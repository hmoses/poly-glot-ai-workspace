# Poly-Glot MCP Distribution and Tool Surface

Verified: 2026-10-09. This is a point-in-time check. A directory displaying all 15 tools does not imply its manually maintained overview is current.

## Canonical inventory (15 tools)

- Core (7): `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`
- BYOM (4): `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`
- Language/audio (4): `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`

Product baseline: **v1.11.0; 15 tools; 38 languages; 9 built-in providers; 1,022 templates**. Remote endpoint: `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp`.

## Verified distribution surfaces

| Surface | Tool coverage | Last observed status | Action still needed |
|---|---|---|---|
| [MCP.so](https://mcp.so/servers/poly-glot-ai-workspace) | **15/15** in dynamic Tools | Verified + Featured; overview and About text still incorrectly say **7 tools**, and provider lists say **Groq** instead of **HuggingChat** | Claimed-owner listing editor or MCP.so support must update manually maintained description, overview, and provider tags; server tool registrations require no changes |
| [Glama remote connector](https://glama.ai/mcp/connectors/io.github.hmoses/poly-glot-ai-workspace) | **15/15** live listed | **Healthy**, last tested 2026-10-09 17:16 UTC; owner verified; summary still incorrectly says **35 languages** | Owner Admin → Manage connector → update to **38 languages**, and enable **Use Glama listing details as the source of truth** if registry sync overwrites edits |
| [Glama GitHub-backed server](https://glama.ai/mcp/servers/hmoses/poly-glot-ai-workspace) | **15/15** in README | Full tools list and **38 languages** displayed | No tool-list correction needed |
| [GitHub source](https://github.com/hmoses/poly-glot-ai-workspace) | **15/15** in README, server code | v1.11.0 source | No missing registrations; registry `server.json` carries machine-readable inventory |
| [Website MCP page](https://hmoses.github.io/poly-glot-site/mcp-integrations.html) | **15/15** in page | GitHub Pages deployment verified successful 2026-10-09 | No missing tool names |
| [Hugging Face Space](https://huggingface.co/spaces/HWM2/poly-glot-ai-workspace) | Not independently inspectable from Space landing page | Space **Running** | Do not assert 15-tool visibility on Space without inspecting its iframe/code |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/) | Not independently verified in public API this check | Canonical `server.json` v1.11.0 prepared; publish workflow tag-triggered | Check registry version and run `.github/workflows/publish-mcp-registry.yml` via a version tag if new metadata must be published |

## Deployment and operational observations

- Neon production MCP `mcp` current/active deployment **53** completed on 2026-10-08, consistent with v1.11.0 source.
- Glama's current live health is **Healthy**; the older 2026-10-08 note saying Unhealthy is obsolete.
- Neon `entitlements` current deployment **8 failed** with `Cannot find package 'jose' imported from /opt/function/auth.js`; active deployment remains **7 (completed)**. Do not report deployment 8 as live. Diagnose separately before redeploying, preserving subscription verification and free-send rules.
- MCP.so and Glama owner UI edits cannot be performed by commits to this GitHub repository alone. Do not mark their stale text corrected until their public pages update.
- Do not change MCP tool schemas, trial policy, Apple verification, authentication, production endpoint, or runtime merely to refresh directory copy.

## Registry publication

`server.json` documents the current full 15-tool inventory in its publisher-provided metadata for automated consumers and links to the canonical tools page. The official Registry publisher workflow runs on Git tags `v*`; GitHub main-branch commits alone are not proof of Registry publication.
