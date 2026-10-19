# Current Entitlement Map — Poly-Glot AI Workspace

> Source reviewed October 19, 2026. This is a **source-level contract**, not certification of Apple purchase lifecycle or all 15 production tool states. Canonical manifests: `config/polyglot-capabilities.json` and `config/polyglot-product-parity.json`.

## Subscription and identity rules

- Eligible customers authorize an Apple Pro Monthly or Pro Annual subscription **in the native app** to begin Apple's 3-day introductory offer. Apple controls offer eligibility and subscription renewal. Unless canceled, the authorized plan is billed at the price shown by Apple after the trial.
- MCP **cannot** initiate an Apple purchase or start an app-managed trial. `POST /v1/trials/start` rejects attempts.
- Verified current Apple subscription transactions grant Pro access. The MCP entitlement service currently categorizes verified active transactions by monthly or annual product ID; it **does not separately label Apple introductory transactions as `trial`**. The `trial` state is also used to honor existing, unexpired **legacy app-managed trials**.
- No ongoing free Sends, free-template bodies, or post-trial free allowance. `POST /v1/free-send/consume` denies access.
- Old app-managed trials cannot convert into paid billing without a distinct Apple-authorized subscription transaction.
- Authentication and Apple signed-transaction verification are required for paid access. Production must fail closed if remote verification is unavailable.

## Product IDs

| Product | Canonical ID | MCP entitlement |
|---|---|---|
| Pro Monthly | `ai.polyglot.workspace.pro.monthly` | `pro_monthly` |
| Pro Annual | `ai.polyglot.workspace.pro.annual` | `pro_annual` |

The entitlement service also supports certain earlier product IDs for compatibility. Do not change or remove those without reviewing existing Apple subscribers.

## MCP access map

| Capability | No verified entitlement | Apple-authorized subscription / introductory offer | Existing unexpired legacy trial |
|---|---|---|---|
| Language options, subscription status, BYOM capabilities information | Available | Available | Available |
| Workspace and template search (discovery) | Callable, but no usable template bodies | Available | Available |
| Template details and prompt building | Locked | Available | Available |
| Compare Mode and custom Compare preparation | Locked | Available | Available |
| BYOM validation and execution | Locked | Available | Available |
| Transcription, language detection, translation, localization | Locked | Available | Available |
| Ongoing free Sends or templates after expiry | None | Not applicable while authorized | None after expiry |

The `get_template` tool may be invoked while unsubscribed, but the underlying `templateAccess()` gate must prevent template-body disclosure. The following 15 tools must retain their contracts:

- Core: `get_language_options`, `get_subscription_status`, `open_workspace`, `search_templates`, `get_template`, `build_prompt`, `prepare_compare`.
- BYOM: `get_custom_model_capabilities`, `validate_custom_model`, `run_custom_model`, `prepare_custom_compare`.
- Language/media: `transcribe_audio`, `detect_language`, `translate_text`, `localize_text`.

## Verification boundary

As of October 19, the active Neon functions were **MCP deployment 63** and **entitlements deployment 10**, both marked completed. MCP deployment 63 was verified live with all 15 tools and corrected `build_prompt` and `prepare_custom_compare` descriptions; official MCP Registry metadata version `1.11.1` was also published. No Apple transactions were recorded in the connected production database during the audit. This confirms deployment metadata, **not** that Apple authorization, expiration, cancellation, restoration, or all 15 tool gates passed end-to-end testing.

Do not substitute historical iOS/macOS build numbers, old parity documentation, or generated metadata for the latest respective source repositories and App Store Connect evidence. Preserve the production endpoint, existing databases, StoreKit integration, authentication, and legacy customer records.
