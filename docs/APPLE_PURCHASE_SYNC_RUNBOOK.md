# Apple subscription → Neon → MCP: deployment and verification

Last reviewed: 2026-10-09.

## Current observed state
- The Neon `entitlements` Function deployment #8 **failed**: missing `jose` package.
- The previous completed deployment #7 is still active (dated 2026-08-29).
- The Neon table `apple_transactions` has **0** rows (not a measure of App Store sales).
- `conversion_events` has **9** events: 8 tagged `goose`, 1 `historical_backfill` — not proof of Apple purchases.
- The app's 3-day first-Send trial is app-managed; it does NOT enroll customers in an App Store introductory offer and does not auto-convert.

## Changes staged, NOT automatically deployed
- Build function ZIP with `node scripts/package-neon-entitlements.mjs`. It runs `npm ci --omit=dev` inside the archive, validates imports of `jose`, `pg`, and `@apple/app-store-server-library`, and emits `dist/neon-entitlements.zip`.
- The Apple JWS verifier now accepts `APPLE_ROOT_CA_B64`, matching the existing Neon Function environment metadata, in addition to `APPLE_ROOT_CA_PATHS`. Obtain official trusted root certificates from Apple PKI.
- Apple purchase-to-user linking now rejects reassignments to another account.
- The iOS and Mac source PRs separately configure the `entitlements` HTTPS host and submit verified StoreKit 2 signed transactions only in conjunction with a fresh, explicitly obtained Sign in with Apple identity token. Local StoreKit access stays independent when Neon is unavailable.
- The apps no longer POST unverified transaction IDs to the GitHub Pages `/activate-iap` path or keep Pro unlocked after native StoreKit reports no verified entitlement.

## Production prerequisites (owner/admin)
1. **Privacy**: Review current App Store privacy declarations, privacy policy, and consent before releasing transaction/account sync. It collects purchase metadata and links it to a signed-in account; the existing “Data Not Collected” and “nothing uploaded” claims may need correction. Sign in remains optional for ordinary app use.
2. **Entitlement Function**: Deploy the tested ZIP from this branch to the existing Neon `entitlements` Function, keeping production env vars. Verify `DATABASE_URL`, `APPLE_BUNDLE_ID=ai.polyglot.workspace`, `APPLE_APP_ID=6804499285`, `APPLE_ENVIRONMENT=PRODUCTION`, `APPLE_ROOT_CA_B64` or `APPLE_ROOT_CA_PATHS`, and, if using MCP OAuth, `POLYGLOT_OIDC_ISSUER` and `POLYGLOT_OIDC_AUDIENCE`. Check the new deployment is **completed** (not just created) and that it is **active**.
3. **Apple**: In App Store Connect, configure **App Store Server Notifications V2** to send production events to `https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech/v1/apple/notifications`. Configure sandbox separately as appropriate; do not accept sandbox signatures in production verification.
4. **Apps**: Build and sandbox-test iOS and macOS source branches. Confirm their Info.plists contain `PolyGlotEntitlementBaseURL`. Publish through the normal App Store review process; repository commits do not reach installed apps automatically.
5. **Verification**: Use a real Apple sandbox subscription. Verify StoreKit unlocks Pro on the correct device; after optional Sign in with Apple and a successful server sync, verify an `apple_transactions` row with the Apple product ID and `environment=Sandbox` *in a separate sandbox-configured environment*; verify its account receives `pro_monthly` or `pro_annual` through the authenticated `GET /v1/entitlements/me`; test restore, expiration, refund, cancellation, no account, and network-offline paths. Repeat with an authorized production purchase only in production.
6. **ASC**: Compare actual production subscriptions in App Store Connect → Analytics / Sales and Trends. Database event counts are NOT the same metric. Apple records eligible purchases whether or not the Neon integration works.

## Security invariants
- Keep the current 15 MCP tools, Apple StoreKit purchase flow, entitlement gating, free templates, and app-managed three-day trial intact.
- Treat `/v1/apple/sync` as an authenticated server endpoint: verify *both* the Apple identity JWT and the Apple-signed transaction JWS; never grant Pro on product ID, user-submitted `isPro`, or transaction ID alone.
- Always validate transaction bundle ID, environment, revocation/expiration, and ownership. Only trusted Apple notification signatures can update transactions without user sign-in.
- Never store identity JWTs in localStorage or analytics. This sync uses a short-lived in-memory token after explicit Apple sign-in.
- Without sign-in, account linking will not occur; App Store Server Notifications V2 is the path for collecting unlinked Apple subscription transactions. This limitation is intentional.
