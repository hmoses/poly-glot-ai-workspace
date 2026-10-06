# Poly-Glot MCP Current Baseline

> Source baseline verified: 2026-10-06.

## Canonical Product Contract

| Item | Current value |
|---|---|
| Parity contract | `config/polyglot-product-parity.json` |
| parityVersion | `2026-10-06.1` |
| MCP target version | `1.11.0` |
| Tools | 15 |
| Languages | 38 |
| Built-in AI providers | 9 |
| Templates | 1,022 |
| Trial | 3 days, begins on first qualifying Send |
| Post-trial free send | 1 shared single-AI Send every rolling 24 hours |
| Pro templates | Locked post-trial |
| Compare Mode | Trial + Pro only |
| BYOM execution | Trial + Pro only |
| Cross-platform language tools | Trial + Pro only |
| Trial auto-conversion | No |

## 15 MCP Tools

Core: `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`.

BYOM: `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`.

Language/media: `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`.

## Provider Parity

Compare Mode accepts: ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot, Mistral, HuggingChat, and DuckDuckGo AI.

## Rolling Free-Send Enforcement

The source now persists `last_free_send_at` and atomically consumes the post-trial free Send through `POST /v1/free-send/consume`. A second free Send is blocked until exactly 24 hours after the previous successful free-send reservation. The database upgrade is in `entitlement-service/sql/002_rolling_free_send.sql`.

## Localization

The MCP language contract contains 38 product languages. The embedded MCP widget contains all 38 selectable languages and UI strings for the newly added Bulgarian, Lithuanian, Latvian, and Estonian locales. Template metadata falls back safely to English when a translated template entry is unavailable.

## Validation

GitHub Actions parity job **112551312742** completed successfully on commit `4cb4536cbc9f0efdbd1fbd742a1ef881e2aa5aa6`.

## Production Activation Still Required

Source parity and CI are complete. The following are deployment operations, not source changes:

1. Apply `002_rolling_free_send.sql` to the production Neon database.
2. Redeploy the production MCP/entitlement function from the updated source.
3. Publish/update MCP Registry metadata for v1.11.0 after deployment verification.
4. Refresh MCP.so manually if its listing does not re-crawl the canonical metadata.

Do not mark v1.11.0 as production-live until the migration and redeploy are verified against the public endpoint.
