# Poly-Glot AI Workspace for ChatGPT (MCP Apps)

This directory is the ChatGPT/MCP Apps integration built from the Poly-Glot AI Workspace repository. It reuses the real template catalog and now enforces the product's existing subscription model server-side.

## Pricing and access model

The MCP mirrors the pricing and trial language in `ios/www/index.html`:

- 3-day free trial.
- Exactly 25 catalog templates are marked `free`.
- The trial begins when the user first **builds** one of those free templates.
- During the trial, the 25 free templates can be used; Pro templates remain locked.
- After the trial, all templates require Pro.
- Pro Monthly: **$9.99/month**.
- Pro Annual: **$79.99/year** (`Save 33%` messaging preserved from the app).
- Pro unlocks the complete 1,000+ template library.

The UI is not the security boundary. `get_template` withholds a locked template's source prompt body and `build_prompt` checks entitlement before substitution, so direct MCP calls cannot bypass the paywall.

## Tools

- `open_workspace` — render the subscription-aware template browser/editor in ChatGPT.
- `get_subscription_status` — return trial/Pro state and pricing.
- `search_templates` — discover templates and locked state.
- `get_template` — return fields and source prompt only when entitled.
- `build_prompt` — enforce access, start the trial on first free-template use, then deterministically fill the source template.

## Entitlement backends

### Local development

With no external entitlement service configured, entitlements are stored in `data/entitlements.json`. This is for development/single-instance testing only. If MCP OAuth information is available, the local store keys the record by a SHA-256 hash of the bearer token; otherwise `POLYGLOT_MCP_USER_ID` is used as the local development identity.

Useful development variables:

```bash
POLYGLOT_MCP_USER_ID=harold-dev
POLYGLOT_ENTITLEMENT_STORE=/path/to/entitlements.json
POLYGLOT_DEV_PLAN=pro_annual   # optional: not_started | trial | expired | pro_monthly | pro_annual
```

### Production / existing Apple subscribers

Use your Poly-Glot account/backend as the source of truth:

```bash
POLYGLOT_ENTITLEMENT_ENDPOINT=https://api.example.com/v1/me/entitlement
POLYGLOT_TRIAL_START_ENDPOINT=https://api.example.com/v1/me/trial/start
```

The MCP forwards its authenticated bearer token to those endpoints. The read endpoint should return JSON such as:

```json
{
  "userId": "user_123",
  "state": "pro_annual",
  "trialStartedAt": null,
  "trialEndsAt": null
}
```

Valid `state` values are `not_started`, `trial`, `expired`, `pro_monthly`, and `pro_annual`.

The trial-start endpoint receives `{ "trialDays": 3 }` and should atomically start the trial only if it has never started. In production, Apple StoreKit/App Store Server notifications or your existing purchase verification service should update the same account entitlement returned by this endpoint. Do not accept plan state supplied by the widget or tool input.

## Run locally

```bash
npm install
npm run sync
npm run check
npm start
```

The MCP endpoint is `http://localhost:8787/mcp`; `GET /` returns the health check, template counts, and pricing metadata.

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

Choose **Streamable HTTP** and connect to `http://localhost:8787/mcp`.

## Production notes

Deploy to a stable HTTPS origin. Configure MCP/OAuth authentication and the remote entitlement endpoints before public release so ChatGPT users map to real Poly-Glot accounts. The included Dockerfile is suitable for a Node container host.

No `OPENAI_API_KEY` is required for this deterministic MCP server; ChatGPT supplies the model while this service supplies Poly-Glot's catalog, access control, and prompt-building tools.

## First-class language support

The MCP now includes `get_language_options` and supports 38 languages through independent `uiLanguage`, `inputLanguage`, and `outputLanguage` parameters. Localized template names, descriptions, and common field labels reuse the native Poly-Glot translation assets in `data/localizations/`. Stable English template IDs remain the authorization/tool-call keys. See root `LOCALIZATION.md` and `LOCALIZATION_VALIDATION.md`.

## Compare Mode

`prepare_compare` is a first-class MCP tool. It applies the same entitlement checks as normal prompt construction and returns one canonical prompt for the selected providers. It never calls competing AI services or handles their credentials on the user's behalf.
