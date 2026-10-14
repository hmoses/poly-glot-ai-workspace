# Poly-Glot MCP: ChatGPT connection and public discovery

Status: **MCP infrastructure exists; public ChatGPT Plugin Directory publication NOT verified.**
Updated: 2026-10-14.

## Canonical connection

- Name: Poly-Glot AI Workspace
- Production endpoint: `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp`
- Transport: remote Streamable HTTP over HTTPS; no npm/stdin installation.
- Registry ID: `io.github.hmoses/poly-glot-ai-workspace`
- 15 tools: `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`, `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`, `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`.
- 38 languages, 1,022 templates, 8 built-in providers.

## Test from an eligible ChatGPT workspace

1. In **Plugins**, select **Add custom MCP server**. Depending on plan and workspace controls, the older **Workspace settings → Apps → Create** flow may apply.
2. Enter the production `/mcp` URL and configure supported authentication. A server should not be described as requiring OAuth unless the endpoint actually implements it.
3. Acknowledge the permission warning, create the connection, and inspect tool scan results.
4. Verify `get_language_options` and `search_templates` using read-only calls. Check all 15 advertised tools, response errors, and security/privacy behavior without exposing credentials.
5. Confirm `build_prompt` and `prepare_compare` are Send actions requiring entitlements and that comparison preparation **does not call** the selected provider APIs.

> Browser URL checks and static JSON validation are not substitutes for an MCP initialize/tools/list handshake in ChatGPT.

## Public Plugin Directory submission — separate required process

Current process: https://developers.openai.com/plugins/deploy/submission

1. Verify the publisher's individual or business identity in OpenAI Platform and ensure `api.apps.write` / apps-management write permission.
2. Prepare a compliant plugin package ZIP that declares the remote MCP server. Include current name, description, URLs, tool metadata, privacy policy, and review cases. Follow the current plugin package schema and submission portal validation; do not invent a manifest format.
3. Upload via **Plugins → Upload new or existing plugin**, select **With MCP**, and scan the exact production HTTPS endpoint.
4. Fix all validation errors; verify tool permissions, data handling, support and authentication, then submit for review.
5. Wait for approval, select **Publish**, then test findability by **exact name** in the shared ChatGPT/Codex Plugin Directory and capture its published directory URL.
6. Only after publication, update homepage and docs to say **publicly listed** and link to the exact approved directory listing.

Official review conditions: https://developers.openai.com/plugins/deploy/app-review

## Do not claim

- That this MCP is already an OpenAI-approved public plugin.
- That third-party MCP Registry, Glama, or MCP.so listing automatically puts it in ChatGPT search.
- That public search visibility is granted from a GitHub commit.
- That all ChatGPT plans permit the same tool actions.
- That `prepare_compare` invokes provider models or returns their responses.

## After publication

Add a public listing URL and date to site + docs, update localized status labels in all 38 languages, and recheck the published snapshot whenever tool metadata changes.
