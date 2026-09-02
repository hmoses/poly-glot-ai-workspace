# Parity Changelog

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
