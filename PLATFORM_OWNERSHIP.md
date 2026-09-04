# PLATFORM_OWNERSHIP

## iOS
- **Authoritative repo**: `hmoses/polyglot-workspace-ios`
- **Status**: Production
- **Local approved root**: `~/Desktop/PolyGlot/PolyGlotWorkspace_iOS/`
- **Project/workspace**: `ios/App/App.xcodeproj`
- **Scheme**: `App`
- **Targets**: `App`
- **Bundle ID**: `ai.polyglot.workspace`
- **Team ID**: `Q6A8C82TA4`
- **App Store Connect app ID**: `6804499285`
- **Signing**: Apple Distribution: Harold Moses (Q6A8C82TA4)
- **Deployment target**: iOS 15.0
- **Deployment workflow**: `hmoses/polyglot-workspace-ios/.github/workflows/ios-upload-testflight.yml`
- **MCP parity consumer path**: `www/` (Capacitor hybrid app)
- **Marketing version**: 1.0.3
- **Current ASC build**: 609

## macOS
- **Authoritative repo**: `hmoses/polyglot-workspace-mac`
- **Status**: Production
- **Local approved root**: `~/Desktop/PolyGlot/PolyGlotMac/`
- **Project/workspace**: `PolyGlotAI/PolyGlotAI.xcodeproj`
- **Scheme**: `PolyGlotAI`
- **Targets**: `PolyGlotAI`
- **Bundle ID**: `ai.polyglot.workspace`
- **Team ID**: `Q6A8C82TA4`
- **App Store Connect app ID**: `6804499285` (shared with iOS)
- **Signing**: Apple Distribution + 3rd Party Mac Developer Installer: Harold Moses (Q6A8C82TA4)
- **Deployment target**: macOS 15.0 (⚠️ MUST be 15.0, not 13.0)
- **Deployment workflow**: `hmoses/polyglot-workspace-mac/.github/workflows/mac-upload.yml`
- **MCP parity consumer path**: `PolyGlotAI/PolyGlotAI/Resources/public/`
- **Marketing version**: 2.6
- **Current ASC build**: 606

## MCP
- **Authoritative repo**: `hmoses/poly-glot-ai-workspace` (this repo)
- **Production baseline**: Deploy 29 / v1.9.0 / 15 tools / 1,022 templates / 38 languages
- **Parity manifest**: `config/polyglot-product-parity.json`
- **Apple capability generator**: `scripts/generate-apple-capabilities.mjs`
- **Generated Swift contract**: `Generated/PolyGlotCapabilities.swift`
- **Auto-sync workflow**: `.github/workflows/polyglot-mcp-autosync.yml`
- **Registry publish workflow**: `.github/workflows/publish-mcp-registry.yml`
- **Parity check workflow**: `.github/workflows/parity-check.yml`
- **Webhook/dispatch integration**: `webhook/` directory

## Data Ownership (Source of Truth)
| Data | Authoritative Source |
|------|---------------------|
| MCP tool inventory | `poly-glot-ai-workspace/index.mjs` |
| Template count | `poly-glot-ai-workspace/data/` |
| Language count | `poly-glot-ai-workspace/localization.js` |
| Entitlement definitions | `poly-glot-ai-workspace/entitlements.js` |
| Parity contract | `poly-glot-ai-workspace/config/polyglot-product-parity.json` |
| Generated Swift capabilities | `poly-glot-ai-workspace/Generated/PolyGlotCapabilities.swift` |
| Release manifest | `poly-glot-ai-workspace/build/polyglot-release-manifest.json` |
| iOS app source | `polyglot-workspace-ios` |
| macOS app source | `polyglot-workspace-mac` |
| Registry metadata | `poly-glot-ai-workspace/server.json` |

## Shared / Legacy Repos

### `hmoses/polyglot-workspace`
- **Role**: Legacy monorepo (contains ios/ and mac/ directories, shared docs, claude/)
- **Authoritative for**: Historical reference, shared documentation, webhook logic
- **NOT authoritative for**: iOS production builds, macOS production builds
- **Latest commit**: `90bd6cc` (2026-09-04)

### `hmoses/polyglot-mac`
- **Role**: Legacy macOS repo (superseded by `polyglot-workspace-mac`)
- **Authoritative for**: Nothing — frozen at build 561
- **Latest commit**: `f855358` (2026-09-01)

### `hmoses/polyglot-prompt-studio`
- **Role**: Legacy iOS repo (original Prompt Studio, superseded by `polyglot-workspace-ios`)
- **Authoritative for**: Nothing — historical reference only
- **Latest commit**: `855fdb5` (2026-09-03)
