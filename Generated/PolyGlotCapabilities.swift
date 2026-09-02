// ──────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — do not edit manually.
// Source: config/polyglot-capabilities.json
// Entitlement version: 2026-09-02.1
// Run: node scripts/generate-apple-capabilities.mjs
// ──────────────────────────────────────────────────────────────────────

import Foundation

/// Machine-generated capability constants for Poly-Glot iOS/macOS.
/// Kept in sync with the MCP server via CI parity checks.
enum PolyGlotCapabilities {

    static let entitlementVersion = "2026-09-02.1"
    static let schemaVersion = 1

    // MARK: - Products

    enum Products {
        static let monthlyId = "ai.polyglot.workspace.pro.monthly"
        static let annualId  = "ai.polyglot.workspace.pro.annual"
        static let all: [String] = [monthlyId, annualId]
        static let monthlyPrice: Decimal = 9.99
        static let annualPrice: Decimal  = 79.99
    }

    // MARK: - Plans

    enum FreePlan {
        static let compare = false
        static let premiumTemplates = false
        static let crossPlatformTools = false
        static let freeTemplateCount = 25
        static let trialDays = 3
    }

    enum TrialPlan {
        static let compare = false
        static let premiumTemplates = false
        static let crossPlatformTools = true
        static let freeTemplateCount = 25
    }

    enum ProPlan {
        static let compare = true
        static let premiumTemplates = true
        static let crossPlatformTools = true
        static let freeTemplateCount = 25
    }

    // MARK: - Entitlement States

    enum EntitlementState: String, CaseIterable {
        case notStarted = "not_started"
        case trial = "trial"
        case expired = "expired"
        case proMonthly = "pro_monthly"
        case proAnnual = "pro_annual"
    }

    // MARK: - Features

    enum Features {
        static let compare = true
        static let premiumTemplates = true
        static let transcription = true
        static let detectLanguage = true
        static let translation = true
        static let localization = true
        static let templateBrowsing = true
        static let promptBuilding = true
    }
}
