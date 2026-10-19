---
name: polyglot-asc-publish
description: Release and synchronize Poly-Glot AI Workspace iOS/macOS builds and localized App Store Connect metadata. Trigger on "push builds", "publish to ASC", "create new ASC builds", "update What's New", and "move to review".
---

# Poly-Glot AI Workspace ASC Publishing Skill
Updated 2026-10-19. Maintained in GitHub for cross-session retrieval. **This repository skill is not automatically installed as a ChatGPT system-level skill.**

## First actions
1. Read this skill and verify real-time GitHub, App Store Connect (ASC), and local build access. Do not claim access to ASC, signing, or a user computer without checking tools.
2. Inspect BOTH platform's current ASC version records and newest *valid processed* builds. Determine platform from explicit platform attributes, checking minOsVersion/lsMinimumSystemVersion as corroborating hints, never just the numerical build sequence.
3. Read the remote HEAD of the correct source repository on `main`. Check what the user actually requested; avoid unrelated code, subscriptions, paywall, telemetry, or site changes.
4. For build/version changes, bump only the required version/build identifiers consistently in all three authoritative files, ensuring no reused build number, and validate Xcode project build settings.
5. Push ONLY to the correct repo, validate CI, build/sign/upload if authorized tooling is genuinely available, confirm Apple processing, verify ASC metadata and linked binaries, then move to review only when requested.
6. Report actual Git commit SHAs, build/version, upload/processing evidence, ASC state and localization coverage; distinguish completed, pending, failed and unverified tasks.

## Authorized repositories
- iOS/iPadOS: `hmoses/polyglot-workspace-ios`, `main`
- macOS: `hmoses/polyglot-workspace-mac`, `main`
- MCP/shared: `hmoses/poly-glot-ai-workspace`, `main`
- Website: `hmoses/poly-glot-site`, `main`
- Frozen legacy repos: `hmoses/polyglot-workspace` and `hmoses/polyglot-prompt-studio`: NEVER WRITE.

## Required version files
- iOS: `ios/App/App/public/index.html`; `ios/App/App.xcodeproj/project.pbxproj`; `ios/App/App/Info.plist`.
- macOS: `PolyGlotAI/PolyGlotAI/Resources/public/index.html`; `PolyGlotAI/PolyGlotAI.xcodeproj/project.pbxproj`; active `PolyGlotAI/PolyGlotAI/Resources/Info.plist` (not the similarly named unused plist, unless source configuration proves otherwise).
- Preserve `_isMac=true` on Mac and false/absent on iOS. Keep current deployment targets (`IPHONEOS_DEPLOYMENT_TARGET=15.0` and `MACOSX_DEPLOYMENT_TARGET=15.0`) unless the user expressly authorizes a supported change.
- Read remote changes before writing. Rebase/pull or use SHA-conditional updates; never overwrite concurrent commits.

## Product invariants and verification
- Eligible customers start a three-day introductory Pro trial only after authorizing an Apple subscription in StoreKit; authorized subscriptions renew unless canceled. App-managed legacy trials do not initiate Apple billing. After trial/expiry there is no continuing free Send or free-template allowance. Preserve per-account verified entitlement checks; premium templates, Compare Mode, and Photo to AI require valid trial or Pro access. Do not confuse the MCP `trial` state for grandfathered app-managed trials with the Apple-authorized introductory period; verify actual current native source and Apple transaction handling.
- Preserve StoreKit, subscription pricing, paywall, onboarding, eligibility checks, and locked features. Validate against current source before asserting exact entitlement behavior.
- Eight providers: ChatGPT, Claude, Gemini, Grok, Perplexity, Mistral, HuggingChat, DuckDuckGo AI. Copilot is removed. Prompt/photo handoff is user-initiated: no blanket claim of automatic send. Mac Photo to AI via Finder/browser handoff should be verified against actual native code, not overwritten using older "no Mac Photo to AI" statements. Do not invent a Mac camera/OCR scanner.
- 38 in-app languages; verify matching translation key coverage, RTL (Arabic/Hebrew), locale switching, and native guidance. The uploaded older playbook specifies 40 ASC storefront locales; query ASC for actual platform localization counts before claiming coverage.
- Preserve all screenshots, videos, promotional text, descriptions and previous storefront metadata unless the change explicitly requires editing them. Update only allowed fields for the target version and state. The user's older playbook contains stale nine-provider and overly broad privacy language; do not restore it.
- Preserve version-specific What's New banner display logic and localized release notes. A new native build is not automatically required for every editable ASC metadata change.
- Never embed API tokens, .p8 private keys, or credentials in a repo, skill, output or commit. Use configured secure credentials only.
- No "ready for review", "uploaded", "live" or "submitted" without confirmation from Apple and/or GitHub Actions.

## Commands
- `push builds`: synchronize verified ASC/latest source versions; commit, push and verify.
- `create new ASC builds`: implement user-authorized native changes, test, build, sign, upload, and check processing.
- `update What's New`: update permitted ASC release notes and banner copy, preserving localizations; avoid unnecessary builds.
- `move to review`: attach correct validated builds and send each platform through ASC review workflow.
- `audit releases`: read-only reconciliation and evidence report.

## Release report
Provide per-platform repository SHA, marketing version, build number, native build outcome, ASC upload/processing/review state, metadata localization results, and any blockers. A code push alone is not an ASC release.
