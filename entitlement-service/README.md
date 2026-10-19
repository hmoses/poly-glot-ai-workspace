# Poly-Glot production entitlement service

This service is the server-side source of truth for ChatGPT premium access. It verifies StoreKit 2 signed transactions with Apple's official App Store Server Library, persists subscription state in PostgreSQL, receives App Store Server Notifications V2, and returns entitlement state only after validating the user's OAuth/OIDC access token.

## Endpoints

- `GET /v1/entitlements/me` — authenticated entitlement lookup used by the MCP server.
- `POST /v1/trials/start` — authenticated legacy-compatibility endpoint that returns 403; Apple subscription authorization is required.
- `POST /v1/free-send/consume` — authenticated legacy-compatibility endpoint that returns 403; permanent free Sends are discontinued.
- `POST /v1/apple/sync` — native iOS/macOS apps submit a Sign in with Apple identity token plus StoreKit `jwsRepresentation`; both are verified before the transaction is linked to the user.
- `POST /v1/apple/notifications` — App Store Server Notifications V2 receiver.

## Required production setup

1. Run `sql/001_init.sql` against PostgreSQL.
2. Configure Apple root certificates from Apple PKI in `APPLE_ROOT_CA_PATHS`, or supply the deployed Neon function's `APPLE_ROOT_CA_B64` secret. The server validates production and Apple-signed sandbox receipts with distinct verifiers, retaining strict signed-environment, bundle ID, and signature checks. It never accepts unsigned Xcode or local-test receipts.
3. Configure `POLYGLOT_OIDC_ISSUER` and `POLYGLOT_OIDC_AUDIENCE` to match the MCP client's identity issuer. The Apple native sign-in `sub` and the MCP bearer token's validated `sub` must resolve to the same account; external OIDC identities do NOT automatically match Apple identities.
4. Deploy this service over HTTPS.
5. Point MCP POLYGLOT_ENTITLEMENT_ENDPOINT to https://<host>/v1/entitlements/me. Do not configure trial-start or free-Send endpoints as usage-granting flows.
6. Configure App Store Connect Server Notifications V2 to `https://<host>/v1/apple/notifications`.
7. Configure both native apps' entitlement sync base URL. On an explicit Sign in with Apple, and after an eligible purchase or Restore Purchases when a fresh Apple identity token is available, the native app uploads each currently verified StoreKit transaction. Existing subscribers who never reauthenticated after this feature was released must sign in again to initiate that upload.

The service fails closed: a forged product id, unverified Apple transaction, missing/invalid user token, revoked transaction, or expired subscription does not grant Pro.

## Current entitlement policy

- New eligible three-day Pro introductory trials require explicit Apple subscription approval through StoreKit. They renew at the customer’s checkout price unless canceled.
- Verified, unexpired monthly or annual transactions grant Pro. Revoked, expired, or missing-expiration transactions cannot grant Pro.
- Existing app-managed trials continue only through their previously recorded expiration. No MCP tool or API can start a new one.
- The historical one-free-Send-per-day and 25-free-templates allowances are retired; compatibility APIs return denial and never alter customer usage records.
- Read-only language discovery remains available without billing. Remote account entitlement lookup still requires valid authentication.

## Verification status — October 19, 2026

- Neon **entitlements deployment 12** is active. It verifies *both* Apple-signed Production and Sandbox environments; Node tests reject forged, Xcode, malformed and unsupported-environment JWS. Apple-sign-in invalid identity tokens return HTTP 401.
- Neon **MCP deployment 63** is active and exposes all 15 tools with subscription-aware locked responses. No existing production customer purchase, renewal, refund or restoration was changed.
- No Apple transaction was present in the `apple_transactions` production table during the last verification, so **a genuine transaction-to-MCP paid unlock has not been confirmed**. Automated unit tests and HTTP health checks do not substitute for an Apple-signed paid or sandbox transaction.
- The MCP endpoint currently exposes no `/.well-known/oauth-protected-resource`, authorization-server discovery or login handoff. An MCP client must supply a valid identity token for the same Apple Sign In subject, or a standards-compliant client authorization flow must be implemented before subscription-aware client login can be advertised. A native Apple sign-in alone does not transparently authenticate arbitrary MCP clients.
- TestFlight sandbox transaction verification can now succeed when the signed JWS, current Apple identity token and certificate chain pass. This does **not** authorize fake receipts or make TestFlight purchases charge real money.
