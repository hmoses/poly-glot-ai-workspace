# Poly-Glot production entitlement service

This service is the server-side source of truth for ChatGPT premium access. It verifies StoreKit 2 signed transactions with Apple's official App Store Server Library, persists subscription state in PostgreSQL, receives App Store Server Notifications V2, and returns entitlement state only after validating the user's OAuth/OIDC access token.

## Endpoints

- `GET /v1/entitlements/me` — authenticated entitlement lookup used by the MCP server.
- `POST /v1/trials/start` — authenticated legacy-compatibility endpoint that returns 403; Apple subscription authorization is required.
- `POST /v1/free-send/consume` — authenticated legacy-compatibility endpoint that returns 403; permanent free Sends are discontinued.
- `POST /v1/apple/sync` — native Mac app submits a Sign in with Apple identity token plus StoreKit `jwsRepresentation`; both are verified before the transaction is linked to the user.
- `POST /v1/apple/notifications` — App Store Server Notifications V2 receiver.

## Required production setup

1. Run `sql/001_init.sql` against PostgreSQL.
2. Download Apple's root certificates from Apple PKI and set `APPLE_ROOT_CA_PATHS` to those certificate files.
3. Configure `POLYGLOT_OIDC_ISSUER` and `POLYGLOT_OIDC_AUDIENCE` to the same OAuth provider used by the ChatGPT MCP connection.
4. Deploy this service over HTTPS.
5. Point MCP POLYGLOT_ENTITLEMENT_ENDPOINT to https://<host>/v1/entitlements/me. Do not configure trial-start or free-Send endpoints as usage-granting flows.
6. Configure App Store Connect Server Notifications V2 to `https://<host>/v1/apple/notifications`.
7. Configure the Mac app's entitlement sync base URL, then ship the updated Mac build. Existing StoreKit 2 entitlements are linked when the signed-in app submits its current verified transaction.

The service fails closed: a forged product id, unverified Apple transaction, missing/invalid user token, revoked transaction, or expired subscription does not grant Pro.

## Current entitlement policy

- New eligible three-day Pro introductory trials require explicit Apple subscription approval through StoreKit. They renew at the customer’s checkout price unless canceled.
- Verified, unexpired monthly or annual transactions grant Pro. Revoked, expired, or missing-expiration transactions cannot grant Pro.
- Existing app-managed trials continue only through their previously recorded expiration. No MCP tool or API can start a new one.
- The historical one-free-Send-per-day and 25-free-templates allowances are retired; compatibility APIs return denial and never alter customer usage records.
- Read-only language discovery remains available without billing. Remote account entitlement lookup still requires valid authentication.
