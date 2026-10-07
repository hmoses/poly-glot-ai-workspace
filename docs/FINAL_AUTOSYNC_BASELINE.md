# Poly-Glot MCP Current Baseline

> Source baseline refreshed: 2026-10-07.

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

## Production State

Repository-recorded production state is **v1.11.0 / 15 tools / deploy 52**, with entitlement service deploy 8. The rolling free-send migration is recorded as applied in production.

Remaining distribution follow-up is metadata propagation rather than product parity:
1. Confirm the Official MCP Registry reflects v1.11.0 after the publish workflow.
2. Refresh MCP.so manually only if its crawler does not pick up the canonical metadata.

Apple source parity is tracked separately: iOS **1.1.4 build 827** and macOS **3.4 build 812** use the shared entitlement contract `2026-10-06.1`.
