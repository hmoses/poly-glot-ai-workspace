# MCP Surface Matrix

Goose must verify each surface after production deployment.

| Surface | Role | Expected server relationship | Required action | Status | Evidence |
|---|---|---|---|---|---|
| ChatGPT / OpenAI | MCP client / Apps-capable host | Connects to central MCP endpoint | Reconnect/refresh; verify tool discovery and GUI | BLOCKED | Cannot reconnect without owner action in ChatGPT UI |
| Claude | MCP client | Connects to central MCP endpoint | Reconnect/refresh; verify tools | BLOCKED | Cannot reconnect without owner action in Claude UI |
| Goose | MCP client / implementation harness | Connects to central MCP endpoint | Verify all tools | BLOCKED | Requires post-deploy MCP endpoint verification |
| Cursor / generic MCP clients | MCP clients | Connect to central endpoint | Smoke test if available | NOT REQUIRED | No active Cursor integration configured |
| MCP.so | Directory/listing | Should advertise central endpoint | Verify endpoint, description, tool count; update if cached | BLOCKED | Requires production deploy + owner login to update listing |
| Glama | Directory/listing | Should advertise central endpoint | Verify endpoint, description, maintainer/license/tool count | BLOCKED | Requires production deploy + owner to verify/update listing |
| Official MCP Registry | Registry metadata | Should advertise canonical server metadata | Verify manifest/server metadata and endpoint | BLOCKED | Requires production deploy to verify registry reflects 11 tools |
| awesome-mcp-servers | Discovery list | Links to repository/server | Verify description and repo link; update PR if needed | BLOCKED | Requires production deploy; may need PR to update description |
| Hugging Face | Optional showcase surface | Not authoritative backend | Verify only if still intentionally maintained | NOT REQUIRED | Not actively maintained as showcase surface |

## Status values

For every row use exactly one:
- **VERIFIED** — confirmed working post-deploy
- **UPDATED** — listing/metadata refreshed
- **NOT REQUIRED** — surface not applicable or not maintained
- **BLOCKED** — cannot verify/update without owner manual action or production deploy

## Post-Deploy Owner Actions Required

After production deployment, the owner must:
1. Reconnect ChatGPT to the MCP endpoint and verify 11 tools + GUI
2. Reconnect Claude to the MCP endpoint and verify 11 tools
3. Connect Goose to the MCP endpoint and verify 11 tools
4. Log into MCP.so and update tool count to 11, update description
5. Log into Glama and verify/update listing
6. Verify Official MCP Registry reflects server.json with 11 tools
7. Check awesome-mcp-servers description; submit PR if stale
