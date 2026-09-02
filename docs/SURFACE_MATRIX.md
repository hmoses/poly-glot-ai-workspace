# MCP Surface Matrix

Post-deployment surface verification status.

| Surface | Role | Status | Evidence |
|---|---|---|---|
| **Production Health** | Server health | VERIFIED | `{"status":"ok","templates":1022,"supportedLanguages":38}` — live |
| **Production MCP** | Streamable HTTP endpoint | BLOCKED | Live endpoint responds but still running v1.3.0 — code merged to main but Neon Compute requires manual redeploy |
| **Official MCP Registry** | Registry metadata | UPDATED | v1.7.0 published via `mcp-publisher`, workflow run #33663026254 all steps SUCCESS, `isLatest: true` |
| **Glama** | Directory/listing | BLOCKED | Page live at glama.ai/mcp/servers/hmoses/poly-glot-ai-workspace, shows 7 tools (pre-deploy). Will auto-discover 11 tools after production redeploy |
| **MCP.so** | Directory/listing | BLOCKED | Listing live at mcp.so/server/poly-glot-ai-workspace/hmoses. Shows 7 tools. Owner must log in to update description after production redeploy |
| **GitHub** | Repository | UPDATED | README, server.json, package.json, chatgpt-app-submission.json updated. Description + topics set. Commits: 7281f36, 283d78e, ac292f9 |
| **awesome-mcp-servers** | Discovery list | UPDATED | PR #13166 diff + body updated to cross-platform wording, commit dd01f34 on hmoses/awesome-mcp-servers fork |
| **Hugging Face** | Optional showcase | VERIFIED | Space live at huggingface.co/spaces/HWM2/poly-glot-ai-workspace. No stale Apple-only wording. Static Space, no code deploy needed |
| **ChatGPT / OpenAI** | MCP client / Apps host | BLOCKED | chatgpt-app-submission.json updated with 11 tools + cross-platform description. Actual ChatGPT reconnection requires owner action after production redeploy |
| **Claude** | MCP client | BLOCKED | Cannot reconnect until production serves 11 tools. Owner must reconnect in Claude UI after redeploy |
| **Goose** | MCP client | BLOCKED | Cannot verify 11 tools until production serves them. Owner must reconnect after redeploy |
| **Cursor / generic** | MCP clients | NOT REQUIRED | No active integration configured |

## Status key
- **VERIFIED** — confirmed working, correct copy displayed
- **UPDATED** — metadata/copy changed and committed/published
- **BLOCKED** — requires production redeploy or owner manual action
- **NOT REQUIRED** — surface not applicable

## Critical blocker
**Neon Compute production redeploy required.** Code is merged to `main` (commit ac292f9) but Neon does not auto-deploy from GitHub. Owner must manually deploy via the Neon dashboard or CLI.

## Post-redeploy owner actions
1. **Deploy to Neon Compute** from main branch (commit ac292f9+)
2. Verify production `tools/list` shows 11 tools at version 1.7.0
3. Set `OPENAI_API_KEY` in deployment environment (if not already set)
4. Reconnect ChatGPT to MCP endpoint, verify 11 tools + GUI
5. Reconnect Claude to MCP endpoint, verify 11 tools
6. Connect Goose to MCP endpoint, verify 11 tools
7. Log into MCP.so and update description to cross-platform wording
8. Trigger Glama re-index/refresh after production shows 11 tools
9. Verify Official MCP Registry entry reflects live 11 tools
