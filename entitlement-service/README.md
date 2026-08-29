# Poly-Glot production entitlement service

This service is the server-side source of truth for ChatGPT premium access. It verifies StoreKit 2 signed transactions with Apple's official App Store Server Library, persists subscription state in PostgreSQL, receives App Store Server Notifications V2, and returns entitlement state only after validating the user's OAuth/OIDC access token.

## Endpoints

- `GET /v1/entitlements/me` — authenticated entitlement lookup used by the MCP server.
- `POST /v1/trials/start` — authenticated one-time 3-day trial start.
- `POST /v1/apple/sync` — native Mac app submits a Sign in with Apple identity token plus StoreKit `jwsRepresentation`; both are verified before the transaction is linked to the user.
- `POST /v1/apple/notifications` — App Store Server Notifications V2 receiver.

## Required production setup

1. Run `sql/001_init.sql` against PostgreSQL.
2. Download Apple's root certificates from Apple PKI and set `APPLE_ROOT_CA_PATHS` to those certificate files.
3. Configure `POLYGLOT_OIDC_ISSUER` and `POLYGLOT_OIDC_AUDIENCE` to the same OAuth provider used by the ChatGPT MCP connection.
4. Deploy this service over HTTPS.
5. Point MCP `POLYGLOT_ENTITLEMENT_ENDPOINT` to `https://<host>/v1/entitlements/me` and `POLYGLOT_TRIAL_START_ENDPOINT` to `https://<host>/v1/trials/start`.
6. Configure App Store Connect Server Notifications V2 to `https://<host>/v1/apple/notifications`.
7. Configure the Mac app's entitlement sync base URL, then ship the updated Mac build. Existing StoreKit 2 entitlements are linked when the signed-in app submits its current verified transaction.

The service fails closed: a forged product id, unverified Apple transaction, missing/invalid user token, revoked transaction, or expired subscription does not grant Pro.
