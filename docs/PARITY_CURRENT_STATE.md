# Parity Current State — Poly-Glot AI Workspace

> Last verified: 2026-09-02 | parityVersion: 2026-09-02.1

## Four-Surface Parity Matrix

| Feature | iOS | macOS | MCP Backend | MCP UI | Mismatch | Fix |
|---------|-----|-------|-------------|--------|----------|-----|
| **Plans** | | | | | | |
| Free plan exists | ✅ | ✅ | ✅ | ✅ | None | — |
| Trial (3 days) | ✅ StoreKit introOffer | ✅ StoreKit introOffer | ✅ entitlements.js | ✅ "25 free templates for 3 days" | None | — |
| Pro Monthly | ✅ ai.polyglot.workspace.pro.monthly | ✅ same | ✅ pro_monthly | ✅ $9.99/month | None | — |
| Pro Annual | ✅ ai.polyglot.workspace.pro.annual | ✅ same | ✅ pro_annual | ✅ $79.99/year | None | — |
| **Feature Gates** | | | | | | |
| Compare Mode — Free | 🔒 | 🔒 | 🔒 compareAccess() | 🔒 compare_locked view | None | — |
| Compare Mode — Trial | 🔒 | 🔒 | 🔒 compareAccess() | 🔒 compare_locked view | None | — |
| Compare Mode — Pro | ✅ | ✅ | ✅ compareAccess() | ✅ compareView | None | — |
| Premium Templates — Free | 🔒 | 🔒 | 🔒 templateAccess() | 🔒 lockedView | None | — |
| Premium Templates — Pro | ✅ | ✅ | ✅ templateAccess() | ✅ promptView | None | — |
| Transcription — Free | 🔒 (server gate) | 🔒 (server gate) | 🔒 requireEntitlement | N/A (no UI) | None | — |
| Transcription — Trial | ✅ Apple Speech | ✅ Apple Speech | ✅ requireEntitlement | N/A | None | — |
| Transcription — Pro | ✅ Apple Speech | ✅ Apple Speech | ✅ requireEntitlement | N/A | None | — |
| Translation — Free | N/A | N/A | 🔒 requireEntitlement | N/A | None | — |
| Translation — Trial | N/A | N/A | ✅ requireEntitlement | N/A | None | — |
| Translation — Pro | N/A | N/A | ✅ requireEntitlement | N/A | None | — |
| Localization — Free | N/A | N/A | 🔒 requireEntitlement | N/A | None | — |
| Localization — Trial | N/A | N/A | ✅ requireEntitlement | N/A | None | — |
| Localization — Pro | N/A | N/A | ✅ requireEntitlement | N/A | None | — |
| Detect Language — Free | N/A | N/A | 🔒 requireEntitlement | N/A | None | — |
| Detect Language — Trial | N/A | N/A | ✅ requireEntitlement | N/A | None | — |
| Detect Language — Pro | N/A | N/A | ✅ requireEntitlement | N/A | None | — |
| **Languages** | | | | | | |
| Language count | 38 | 38 | 38 | 38 | None | — |
| Language codes match | ✅ | ✅ | ✅ | ✅ | None | — |
| **UI States** | | | | | | |
| Locked template card | 🔒 + PRO badge | 🔒 + PRO badge | locked flag | 🔒 PRO badge + opacity | None | — |
| Paywall view | StoreKit sheet | StoreKit sheet | locked JSON | Plans + pricing | None | — |
| Trial expired message | ✅ localized | ✅ localized | ✅ "trial_expired" | ✅ localized 38 langs | None | — |
| **Entitlement States** | | | | | | |
| not_started | ✅ | ✅ | ✅ | ✅ "Trial Not Started" | None | — |
| trial | ✅ | ✅ | ✅ | ✅ "Free Trial" | None | — |
| expired | ✅ | ✅ | ✅ | ✅ trialExpired msg | None | — |
| pro_monthly | ✅ | ✅ | ✅ | ✅ "Pro Monthly" | None | — |
| pro_annual | ✅ | ✅ | ✅ | ✅ "Pro Annual" | None | — |

## Source Files

| Surface | Key Files |
|---------|-----------|
| iOS | `ios/App/App/IAPManager.swift` |
| macOS | `mac/PolyGlotAI/PolyGlotAI/Sources/IAPManagerMac.swift` |
| MCP Backend | `server.js`, `entitlements.js`, `pricing.js`, `src/cross-platform-tools.js` |
| MCP UI | `data/widget-html.js` |
| Parity Contract | `config/polyglot-product-parity.json` |

## Conclusion

**All four surfaces are in parity.** No mismatches found. The parity contract at `config/polyglot-product-parity.json` is the canonical source of truth.
