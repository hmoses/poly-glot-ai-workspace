# Poly-Glot AI Workspace — ChatGPT Launch

## Listing

- **Display name:** Poly-Glot AI Workspace
- **Subtitle:** Build expert AI prompts
- **Category:** Productivity
- **Website:** https://hmoses.github.io/poly-glot-site/
- **Support:** https://hmoses.github.io/poly-glot-site/
- **Mac App Store:** https://apps.apple.com/us/app/poly-glot-ai-workspace/id6804499285?mt=12

## Pricing represented by the MCP

- 3-day free trial, starting on first eligible free-template use
- 25 free templates during the trial
- Pro Monthly: $9.99/month
- Pro Annual: $79.99/year
- Full Pro access: 1,000+ templates

## Production requirements before submission

1. Deploy `chatgpt-app/` to a stable public HTTPS origin and expose `/mcp`.
2. Configure production authentication for the MCP server.
3. Configure `POLYGLOT_ENTITLEMENT_ENDPOINT` to a server-side service that maps the authenticated Poly-Glot user to `not_started`, `trial`, `expired`, `pro_monthly`, or `pro_annual`.
4. Configure `POLYGLOT_TRIAL_START_ENDPOINT` so first free-template use persists the 3-day trial in that same account system.
5. Ensure the entitlement service validates Apple subscription state server-side. Do not trust plan values supplied by the widget/client.
6. Verify the production privacy-policy URL and terms URL in the OpenAI submission form. The repository provides the product website/support URL but does not contain authoritative privacy/terms URLs for the ChatGPT listing.
7. Run `npm install && npm run check`, then test the deployed `/mcp` endpoint with MCP Inspector and ChatGPT Developer mode.
8. Upload `chatgpt-app-submission.json` in the ChatGPT app submission flow and complete the account-bound review/submission fields.

## Important

The local JSON entitlement store is for development only. A public listing with paid access should not use the anonymous local fallback because it cannot reliably identify a subscriber across devices or reconcile an Apple purchase.

## Production Apple subscriber verification (included)

This build includes `entitlement-service/`, which replaces the development entitlement JSON store for public deployment. It validates the ChatGPT/OAuth user token, verifies StoreKit 2 JWS transactions using Apple's official App Store Server Library, stores verified transactions in PostgreSQL, and receives App Store Server Notifications V2.

The macOS source is also updated to send current verified StoreKit transactions to `/v1/apple/sync` after Sign in with Apple and to attach a stable `appAccountToken` to future purchases. Set the `PolyGlotEntitlementBaseURL` Info.plist value to the deployed entitlement-service origin before shipping the next Mac build.

In `NODE_ENV=production`, the MCP now fails closed if `POLYGLOT_ENTITLEMENT_ENDPOINT` is not configured; it will not silently use the local JSON entitlement store.
