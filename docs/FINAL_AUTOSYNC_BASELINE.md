# FINAL AUTO-SYNC BASELINE — 2026-09-02

Snapshot of all verified facts before final parity + auto-sync work begins.

## Repository

| Item | Value |
|------|-------|
| Repo | `hmoses/poly-glot-ai-workspace` |
| Branch | `main` |
| HEAD commit | `4393c5d` |
| Local path | `/Users/haroldmoses/poly-glot-ai-workspace` |

## Parity Contract

| Item | Value |
|------|-------|
| File | `config/polyglot-product-parity.json` |
| schemaVersion | 1 |
| parityVersion | `2026-09-02.1` |
| Plans | free, trial, pro |
| Features | 8 (compare, premiumTemplates, transcription, detectLanguage, translation, localization, templateBrowsing, promptBuilding) |
| Languages | 38 |
| Entitlement states | 5 (not_started, trial, expired, pro_monthly, pro_annual) |

## Generated Swift

| Item | Value |
|------|-------|
| File | `Generated/PolyGlotCapabilities.swift` |
| entitlementVersion | `2026-09-02.1` |
| Staleness check | ✅ Up to date (`--check` passes) |
| Source | `config/polyglot-capabilities.json` (reads parity contract values) |

## MCP Server

| Item | Value |
|------|-------|
| Version | 1.7.0 |
| Tools | 11 (get_language_options, get_subscription_status, open_workspace, search_templates, get_template, build_prompt, prepare_compare, transcribe_audio, detect_language, translate_text, localize_text) |
| Templates | 1,022 (25 free, 997 pro) |
| Languages | 38 |
| Endpoint | `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp` |
| Health | ✅ OK |
| Deploy | #21 (Neon Functions) |

## Test Suites

| Suite | Result |
|-------|--------|
| Main MCP tests | 63/63 ✅ |
| Entitlement parity | 24/24 ✅ |
| Total parity | 72/72 ✅ |
| **TOTAL** | **159/159** ✅ |

## CI Workflows

| File | Purpose |
|------|---------|
| `.github/workflows/parity-check.yml` | Parity validation, Swift staleness, MCP tests |
| `.github/workflows/publish-mcp-registry.yml` | Registry publish on v*.*.* tags |

## Deployment Policy

| File | `config/deployment-policy.json` |
|------|------|
| stageOnBuildComplete | true |
| productionOnReadyForDistribution | true |
| productionOnBuildComplete | false (safe) |
| requireParityValidation | true |
| requireMcpRegressionTests | true |
| requireProductionSmokeTests | true |

## Webhook

| Item | Value |
|------|-------|
| File | `webhook/index.mjs` |
| Status | Not deployed (infrastructure ready) |

## Apple Product IDs

| Product | ID |
|---------|-----|
| Pro Monthly | `ai.polyglot.workspace.pro.monthly` |
| Pro Annual | `ai.polyglot.workspace.pro.annual` |

Verified identical in:
- iOS `IAPManager.swift` ✅
- macOS `IAPManagerMac.swift` ✅
- Generated `PolyGlotCapabilities.swift` ✅
- `config/polyglot-product-parity.json` ✅

## Apple App Versions

| Platform | Version | Build | Status |
|----------|---------|-------|--------|
| macOS | 2.5 | 586 | WAITING_FOR_REVIEW |
| iOS | 1.0.3 | — | WAITING_FOR_REVIEW |

## Apple Xcode Projects

| Platform | Path | Project |
|----------|------|---------|
| iOS | `~/Desktop/polyglot-workspace/ios/ios/App/App.xcodeproj` | App target |
| macOS | `~/Desktop/polyglot-workspace/mac/PolyGlotAI/PolyGlotAI.xcodeproj` | PolyGlotAI target |

## Swift Integration Status (Pre-Phase 1)

`Generated/PolyGlotCapabilities.swift` exists in MCP repo but is **NOT yet integrated** into either iOS or macOS Xcode projects. Both apps still use hand-maintained `ProductID` enums with identical values.

## Differences from Prior Report

None found. All 159/159 tests pass. Production v1.7.0 live with 11 tools. All product IDs match across all surfaces.
