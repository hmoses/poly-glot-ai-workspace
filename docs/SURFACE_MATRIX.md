# MCP Surface Matrix

Post-deployment surface verification status. Last updated: 2026-10-08.

| Surface | Role | Status | Evidence |
|---|---|---|---|
| **Production Health** | Server health | VERIFIED | `{"status":"ok","templates":1022,"supportedLanguages":38}` — live |
| **Production MCP** | Streamable HTTP endpoint | VERIFIED | Live endpoint source v1.11.0, 15 tools |
| **Official MCP Registry** | Registry metadata | UPDATED | v1.11.0 metadata prepared; publish workflow required for registry promotion |
| **Glama** | Remote connector | OWNER VERIFIED; TEST PROFILE PENDING | Ownership confirmed by Glama email on 2026-10-08 for `io.github.hmoses`. The public connector currently reports Unhealthy and still displays 35 languages. The production MCP exposes unauthenticated Streamable HTTP tool discovery, so Glama's Test Profile should first be configured for **No Auth** and the exact `/mcp` URL. Owner-only Admin test details and listing overrides require a signed-in Glama session. |
| **MCP.so** | Directory/listing | LIVE | Listing live at mcp.so/server/poly-glot-ai-workspace/hmoses (paid $39, verified) |
| **GitHub** | Repository | UPDATED | README, server.json, package.json updated. 38 languages, 15 tools |
| **awesome-remote-mcp-servers** | Discovery list | PR OPEN | Submitted to punkpeye/awesome-remote-mcp-servers (awesome-mcp-servers PR #13166 closed — remote servers split out) |
| **Hugging Face** | Optional showcase | VERIFIED | Space live at huggingface.co/spaces/HWM2/poly-glot-ai-workspace |
| **ChatGPT / OpenAI** | MCP client / Apps host | LIVE | chatgpt-app-submission.json contains all 15 tools, including BYOM |
| **Claude** | MCP client | AVAILABLE | Can connect via Streamable HTTP endpoint |
| **Goose** | MCP client | AVAILABLE | Can connect via Streamable HTTP endpoint |
| **Cursor / generic** | MCP clients | AVAILABLE | Standard Streamable HTTP, any MCP client can connect |

## Status key
- **VERIFIED** — confirmed working, correct data displayed
- **LIVE** — listing exists and is accessible
- **UPDATED** — metadata/copy changed and committed/published
- **AVAILABLE** — endpoint works, client can connect
- **PR OPEN** — pull request submitted, awaiting merge

## Current notes
1. Production database migration `002_rolling_free_send.sql` is recorded as applied on `br-steep-leaf-ae2o29qz`.
2. Production MCP v1.11.0 is recorded live as Neon deployment 52; entitlement service deployment 8 is recorded live.
3. iOS source is 1.1.4 build 827; macOS source is 3.4 build 812; both now consume the generated entitlement contract `2026-10-06.1`.
4. MCP.so description may still require a manual owner-login refresh if its crawler does not auto-sync.
5. Glama's remote connector listing is currently marked Unhealthy and uses outdated 35-language text despite 38-language source metadata in `server.json`. Ownership of `io.github.hmoses` was confirmed by the user's Glama email. In the authenticated Glama Admin → Test Profile, first select **No Auth** for the public Streamable HTTP tool-discovery endpoint and rerun the health check; inspect the response/error before changing server transport or policies. Update listing copy to 38 languages with the owner's listing override. The repository `glama.json` already specifies maintainer `hmoses` and cannot by itself claim a remote connector. The official registry's description may overwrite Glama edits unless 'Use Glama listing details as the source of truth' is enabled in Glama. Do not modify the MCP server, entitlements, or trial logic merely to make directory checks pass without a diagnosed server error.
6. Glama TDQS schema-documentation fix prepared in GitHub source on 2026-10-08: `server.js` and `src/cross-platform-tools.js` now include purpose, behavior, usage, and parameter descriptions for all 15 tools (including `detect_language.text`). This is **source-only** until a tested Neon MCP deployment is performed and Glama rescans the live endpoint. The published 2.8/5.0 `detect_language` TDQS (scored 2026-09-19) should not be represented as improved until Glama recomputes it. GitHub commits: `5a4a197f`, `3d8a8f77`, `b27c9ee7`, `36efeeb8`. Preserve the existing 15 tool names, entitlements, trial policy, Apple verification, and URL when deploying.
7. Diagnostic on 2026-10-08: production Neon MCP deployment 52 is marked completed, but `mcp_request_events` in the production project has no entries later than 2026-10-07 01:36:28 UTC, shortly before deployment 52. Neon invocation logs do show traffic afterward; therefore the absence of recorded errors is **not** proof that all MCP discovery requests are succeeding. Investigate telemetry/database access and record the Glama health-check response before any production redeploy. Neither Glama's owner-only admin actions nor a code-bundle deployment can be completed merely by updating GitHub source documentation.
