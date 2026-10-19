# Poly-Glot MCP — Subscription-Only Baseline

> Current contract reviewed October 19, 2026. The earlier October 7 automatic-sync baseline described a superseded free-Send model and should not be used for release or billing decisions.

## Current source contract

| Item | Current description |
|---|---|
| Canonical capabilities | `config/polyglot-capabilities.json` + `config/polyglot-product-parity.json` |
| MCP version | 1.11.0 |
| Tools | 15 |
| Supported languages | 38 |
| Built-in AI providers | 8 (Copilot excluded) |
| Templates | 1,022 |
| 3-day introductory offer | Eligible customers approve Apple subscription in native app |
| Auto-renewal | Authorized subscription renews unless canceled |
| Legacy trial billing | Cannot bill without separate Apple authorization |
| Continuing free Sends | 0 |
| Free-template entitlement | 0 |
| Premium tools | Verified subscription / Apple introductory offer / unexpired grandfathered trial |

**Core (7):** `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`.

**BYOM (4):** `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`.

**Language/media (4):** `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`.

## Enforcement

The legacy `last_free_send_at` column remains for compatibility/audit, but no longer grants free access. `POST /v1/free-send/consume` must respond with a subscription-required denial. `POST /v1/trials/start` must deny MCP-started trials. Do not delete legacy database columns or historical migrations merely to update the subscription rules.

Production entitlement decisions must be based on verified Apple-signed transactions and server-side identity or on the existing, time-bounded legacy trial record. Neither tools/list nor read-only discovery starts billing.

## Production observations (October 19, 2026)

Neon MCP **deployment 62** and entitlement-service **deployment 10** were listed as active and completed. The production database had **zero Apple transaction records** when checked. Live Apple subscription lifecycle, authenticated 15-tool matrix, and StoreKit restoration behavior were **not verified** by that observation.

## Historical verification preserved

GitHub Actions Parity Check run **#60**, job ID `37681503758`, passed on `b68171c66dac3a6be976b66e8fa4e854630eb399` for the earlier 2026-10-07 contract. This is historical evidence only; it is not a passing CI result for current `main`. Historical iOS 827/macOS 812 references are not current ASC build verification.

## Directory sync

Canonical metadata must state 15 MCP tools, 38 languages, 8 built-in AI providers, and an Apple-authorized introductory trial with no continuing free allowance. MCP.so and Glama may require owner-side listing edits and/or crawler refreshes; a GitHub commit alone does not confirm their public pages were updated.
