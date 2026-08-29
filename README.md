# Poly-Glot AI Workspace MCP App

Node MCP server with an embedded MCP Apps / ChatGPT Apps SDK GUI and server-side entitlements.

Production MCP: `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp`

Health: `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/`

Entitlement API base: `https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech/`

## Seven tools

- `search_templates`
- `get_template`
- `build_prompt`
- `prepare_compare`
- `get_language_options`
- `get_subscription_status`
- `open_workspace`

`open_workspace` renders the embedded GUI in UI-capable MCP hosts.

## Local validation

```bash
npm install
npm run sync
npm run check
npm start
```

Local MCP endpoint: `http://localhost:8787/mcp`.

## Production environment

Use `.env.production.example` as the non-secret template. Keep secrets out of source control. The production entitlement service remains authoritative; do not accept plan state from widget/tool input.
