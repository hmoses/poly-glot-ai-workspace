# Parity Changelog

## 2026-09-02.2 — Swift Parity Integration + Auto-Sync Pipeline

- **parityVersion**: 2026-09-02.1 (unchanged — no product behavior change)
- **Feature**: Swift integration into iOS/macOS Xcode targets + auto-sync pipeline
- **Previous behavior**: `PolyGlotCapabilities.swift` existed in MCP repo only; iOS/macOS used hardcoded product IDs
- **New behavior**: Both iOS and macOS Xcode projects include `PolyGlotCapabilities.swift`; `ProductID` enum now references generated constants
- **Affected surfaces**: iOS, macOS
- **Docs updated**: SWIFT_PARITY_INTEGRATION.md, APPSTORE_WEBHOOK.md, OWNER_SETUP.md, FINAL_AUTOSYNC_BASELINE.md

### Changes
- Copied `Generated/PolyGlotCapabilities.swift` to iOS (`App/PolyGlotCapabilities.swift`) and macOS (`Sources/PolyGlotCapabilities.swift`)
- Added to both Xcode project targets (PBXBuildFile, PBXFileReference, PBXGroup, PBXSourcesBuildPhase)
- Wired `ProductID.monthly/annual/all` to `PolyGlotCapabilities.Products.monthlyId/annualId/all`
- Both targets build successfully
- Updated parity tests to check combined source (IAP + PolyGlotCapabilities)
- Updated `config/deployment-policy.json` with concurrencyLock and requireRealWebhookVerificationBeforeLiveStatus
- Created `build/polyglot-release-manifest.json` for build ↔ parity ↔ MCP association
- Created `.github/workflows/polyglot-mcp-autosync.yml` for webhook-triggered deployment
- Created `scripts/test-webhook.mjs` — 23 webhook/policy tests
- Created `docs/SWIFT_PARITY_INTEGRATION.md`, `docs/APPSTORE_WEBHOOK.md`, `docs/OWNER_SETUP.md`
- All 182 tests pass (63 + 24 + 72 + 23)

## 2026-09-02.1 — Initial Parity Contract

- **parityVersion**: 2026-09-02.1
- **Feature**: All shared product behavior
- **Previous behavior**: No formal parity contract; each surface implemented independently
- **New behavior**: Single canonical contract at `config/polyglot-product-parity.json`
- **Affected surfaces**: iOS, macOS, MCP Backend, MCP UI
- **Docs updated**: PARITY_CURRENT_STATE.md, CURRENT_ENTITLEMENT_MAP.md, README.md

### Changes
- Created `config/polyglot-product-parity.json` as canonical parity contract
- Created `config/polyglot-capabilities.json` for MCP/Apple capability mapping
- Created `Generated/PolyGlotCapabilities.swift` from shared config
- Created `scripts/test-total-parity.mjs` — 72 cross-surface parity tests
- Created `scripts/validate-entitlement-parity.mjs` — 24 entitlement parity tests
- Created `scripts/generate-apple-capabilities.mjs` — Swift constant generator
- Created `.github/workflows/parity-check.yml` — CI fails on mismatch
- Added entitlement gates to all 4 cross-platform tools (transcribe_audio, detect_language, translate_text, localize_text)
- All 4 surfaces verified in parity: plans, products, features, languages, messages, lock states
