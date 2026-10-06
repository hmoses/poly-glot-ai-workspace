# MCP Surface Matrix

Post-deployment surface verification status. Last updated: 2026-10-06.

| Surface | Role | Status | Evidence |
|---|---|---|---|
| **Production Health** | Server health | VERIFIED | `{"status":"ok","templates":1022,"supportedLanguages":38}` — live |
| **Production MCP** | Streamable HTTP endpoint | VERIFIED | Live endpoint source v1.11.0, 15 tools |
| **Official MCP Registry** | Registry metadata | UPDATED | v1.11.0 metadata prepared; publish workflow required for registry promotion |
| **Glama** | Directory/listing | LIVE | Page live at glama.ai/mcp/servers/hmoses/poly-glot-ai-workspace |
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

## Known gaps
1. Production database migration `002_rolling_free_send.sql` must be applied before rolling 24-hour enforcement can be active in production.
2. Production MCP function must be redeployed from the updated source.
3. MCP.so description may need manual owner-login refresh if its crawler does not auto-sync.
