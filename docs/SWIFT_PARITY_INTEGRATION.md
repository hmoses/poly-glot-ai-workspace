# Swift Parity Integration

## Source File

`Generated/PolyGlotCapabilities.swift` — auto-generated from `config/polyglot-product-parity.json`.

## Generation Command

```bash
node scripts/generate-apple-capabilities.mjs
```

## Verification Command (CI)

```bash
node scripts/generate-apple-capabilities.mjs --check
```

Exits non-zero if the generated file is stale (content differs from what the generator would produce).

## Target Membership

| Platform | Destination | Target |
|----------|------------|--------|
| iOS | `~/Desktop/polyglot-workspace/ios/ios/App/App/PolyGlotCapabilities.swift` | App |
| macOS | `~/Desktop/polyglot-workspace/mac/PolyGlotAI/PolyGlotAI/Sources/PolyGlotCapabilities.swift` | PolyGlotAI |

Both destinations are copies of the same generated file. CI verifies they are identical.

## What It Provides

| Enum/Struct | Contents |
|-------------|----------|
| `Products` | `monthlyId`, `annualId`, `all`, `monthlyPrice`, `annualPrice` |
| `FreePlan` | `compare`, `premiumTemplates`, `crossPlatformTools`, `freeTemplateCount`, `trialDays` |
| `TrialPlan` | Same feature flags for trial tier |
| `ProPlan` | Same feature flags for pro tier |
| `EntitlementState` | `notStarted`, `trial`, `expired`, `proMonthly`, `proAnnual` |
| `Features` | All 8 feature availability booleans |

## What It Does NOT Replace

- StoreKit transaction verification
- Apple receipt validation
- Subscription expiration checks
- Server-side entitlement enforcement
- Apple Speech / native localization

The generated contract tells the app **what the product policy SHOULD be**.
Actual authorization comes from Apple/server entitlement state.

## Current Integration

Both iOS `IAPManager.swift` and macOS `IAPManagerMac.swift` now source their `ProductID` enum from `PolyGlotCapabilities.Products`:

```swift
private enum ProductID {
    static let monthly = PolyGlotCapabilities.Products.monthlyId
    static let annual  = PolyGlotCapabilities.Products.annualId
    static let all: [String] = PolyGlotCapabilities.Products.all
}
```

## How to Regenerate After Parity Changes

1. Edit `config/polyglot-product-parity.json`
2. Run `node scripts/generate-apple-capabilities.mjs`
3. Copy output to both iOS and macOS targets
4. Build both targets
5. Run `node scripts/generate-apple-capabilities.mjs --check` (CI does this automatically)
6. Run `node --test scripts/test-total-parity.mjs` to verify 4-surface parity

## Build Results

| Platform | Result | Date |
|----------|--------|------|
| iOS | ✅ BUILD SUCCEEDED | 2026-09-02 |
| macOS | ✅ BUILD SUCCEEDED | 2026-09-02 |
