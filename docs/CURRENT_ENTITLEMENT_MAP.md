# Current Entitlement Map — Poly-Glot AI Workspace

> Generated from verified runtime behavior. Last updated: 2026-09-18.

## Entitlement States

| State | Apple StoreKit | MCP Server (`pricing.js`) | Match |
|-------|---------------|--------------------------|-------|
| `not_started` | No transaction history | `ENTITLEMENT_STATES.NOT_STARTED` | ✅ |
| `trial` | `offerType == .introductory` | `ENTITLEMENT_STATES.TRIAL` | ✅ |
| `expired` | Transaction revoked / no current entitlement | `ENTITLEMENT_STATES.EXPIRED` | ✅ |
| `pro_monthly` | Active transaction for `ai.polyglot.workspace.pro.monthly` | `ENTITLEMENT_STATES.PRO_MONTHLY` | ✅ |
| `pro_annual` | Active transaction for `ai.polyglot.workspace.pro.annual` | `ENTITLEMENT_STATES.PRO_ANNUAL` | ✅ |

## Product IDs

| Product | iOS (`IAPManager.swift`) | macOS (`IAPManagerMac.swift`) | MCP (`pricing.js`) | Match |
|---------|-------------------------|------------------------------|-------------------|-------|
| Pro Monthly | `ai.polyglot.workspace.pro.monthly` | `ai.polyglot.workspace.pro.monthly` | `pro_monthly` | ✅ |
| Pro Annual | `ai.polyglot.workspace.pro.annual` | `ai.polyglot.workspace.pro.annual` | `pro_annual` | ✅ |

## Feature Gates

| Feature | Apple Gate | MCP Gate | Free | Trial | Pro | Parity |
|---------|-----------|----------|------|-------|-----|--------|
| Language list | None | None (`get_language_options`) | ✅ | ✅ | ✅ | ✅ |
| Subscription status | None | None (`get_subscription_status`) | ✅ | ✅ | ✅ | ✅ |
| Template browsing | UI locked flags | `search_templates` + locked flags | ✅ sees locks | ✅ | ✅ | ✅ |
| Template details | UI locked flags | `get_template` + `templateAccess()` | 🔒 pro templates | ✅ free | ✅ | ✅ |
| Prompt building (Send) | StoreKit paywall | `build_prompt` + `templateAccess()` | ✅ starts trial | ✅ | ✅ | ✅ |
| Compare Mode (Send) | StoreKit paywall | `prepare_compare` + `compareAccess()` | ✅ starts trial | ✅ | ✅ | ✅ |
| BYOM info | None | `get_custom_model_capabilities` | ✅ | ✅ | ✅ | ✅ |
| BYOM validation | StoreKit paywall | `validate_custom_model` + entitlement gate | 🔒 | ✅ | ✅ | ✅ |
| BYOM execution | StoreKit paywall | `run_custom_model` + entitlement gate | 🔒 | ✅ | ✅ | ✅ |
| Custom Compare (Send) | StoreKit paywall | `prepare_custom_compare` + `compareAccess()` | ✅ starts trial | ✅ | ✅ | ✅ |
| Transcription | Apple Speech (native) | `transcribe_audio` + entitlement gate | 🔒 | ✅ | ✅ | ✅ |
| Language detection | N/A (native) | `detect_language` + entitlement gate | 🔒 | ✅ | ✅ | ✅ |
| Translation | N/A (native) | `translate_text` + entitlement gate | 🔒 | ✅ | ✅ | ✅ |
| Localization | Native localization | `localize_text` + entitlement gate | 🔒 | ✅ | ✅ | ✅ |

## Shared Source of Truth

- **Apple side**: StoreKit 2 `Transaction.currentEntitlements` → checks `ProductID.all` → sets `isPro` / `isInTrial`
- **MCP side**: `entitlements.js` → `getEntitlement()` → checks remote entitlement service → returns `{ isPro, trialActive, canUseFree }`
- **Pricing**: `pricing.js` → `PRICING` object (single source for prices, trial days, plan IDs)
- **Template access**: `templateAccess(template, entitlement)` in `entitlements.js`
- **Compare access**: `compareAccess(entitlement)` in `server.js`, allowing Pro or active trial and locking after expiration

## Mismatches Found

| Issue | Severity | Status |
|-------|----------|--------|
| None | — | ✅ All gates match |

## Notes

- iOS and macOS share identical product IDs (`ai.polyglot.workspace.pro.monthly`, `ai.polyglot.workspace.pro.annual`)
- Trial is 3 days on both platforms
- Free users get 25 templates on both platforms
- Compare Mode is available during an active trial and for Pro subscribers
- Compare Mode locks when the trial expires unless the user has an active Pro subscription
- Cross-platform tools (transcribe, detect, translate, localize) require Pro or active trial on MCP
- BYOM tools (validate_custom_model, run_custom_model) require Pro or active trial; get_custom_model_capabilities is open
- Apple-native behavior (Speech, StoreKit, native localization) is fully preserved — cross-platform tools are additive only
- The 3-day trial starts on the user's first Send (build_prompt, prepare_compare, or prepare_custom_compare)
- The trial does NOT automatically convert to a paid subscription; purchase is required via Apple StoreKit
- Total MCP tools: 15
- Supported languages: 35
- Distribution: hosted remote MCP (no local package)
