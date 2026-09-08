# MCP Surface Matrix

Post-deployment surface verification status. Last updated: 2026-09-08.

| Surface | Role | Status | Evidence |
|---|---|---|---|
| **Production Health** | Server health | VERIFIED | `{"status":"ok","templates":1022,"supportedLanguages":35}` — live |
| **Production MCP** | Streamable HTTP endpoint | VERIFIED | Live endpoint v1.9.0, 15 tools, Deploy 30 |
| **Official MCP Registry** | Registry metadata | UPDATED | v1.9.0 published, `isLatest: true` |
| **Glama** | Directory/listing | LIVE | Page live at glama.ai/mcp/servers/hmoses/poly-glot-ai-workspace |
| **MCP.so** | Directory/listing | LIVE | Listing live at mcp.so/server/poly-glot-ai-workspace/hmoses (paid $39, verified) |
| **GitHub** | Repository | UPDATED | README, server.json, package.json updated. 35 languages, 15 tools |
| **awesome-remote-mcp-servers** | Discovery list | PR OPEN | Submitted to punkpeye/awesome-remote-mcp-servers (awesome-mcp-servers PR #13166 closed — remote servers split out) |
| **Hugging Face** | Optional showcase | VERIFIED | Space live at huggingface.co/spaces/HWM2/poly-glot-ai-workspace |
| **ChatGPT / OpenAI** | MCP client / Apps host | LIVE | chatgpt-app-submission.json has 11 core tools (BYOM tools not yet submitted) |
| **Claude** | MCP client | AVAILABLE | Can connect via Streamable HTTP endpoint |
| **Goose** | MCP client | AVAILABLE | Can connect via Streamable HTTP endpoint |
| **Cursor / generic** | MCP clients | AVAILABLE | Standard Streamable HTTP, any MCP client can connect |

## Status key
- **VERIFIED** — confirmed working, correct data displayed
- **LIVE** — listing exists and is accessible
- **UPDATED** — metadata/copy changed and committed/published
- **AVAILABLE** — endpoint works, client can connect
- **PR OPEN** — pull request submitted, awaiting merge

## Known gaps
1. `chatgpt-app-submission.json` lists 11 tools — missing 4 BYOM tools (get_custom_model_capabilities, validate_custom_model, run_custom_model, prepare_custom_compare)
2. MCP.so description may need manual update (owner login required)
