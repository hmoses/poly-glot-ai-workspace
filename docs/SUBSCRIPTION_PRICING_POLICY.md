# Poly-Glot subscription pricing and MCP access

Updated October 22, 2026. Applies to iOS, iPadOS, macOS and the hosted MCP service, subject to each released app version and verified Apple entitlements.

Poly-Glot is free to download, but sending prompts and premium actions require an eligible introductory trial or an active Pro subscription. There is no recurring free Send, daily allowance or free-template entitlement after the trial. Legacy users without active access see the subscription offer on their next restricted action. Read-only MCP discovery may remain available.

## Apple subscriptions

- Pro Monthly: USD $9.99 per month (reference US price).
- Pro Annual: USD $79.99 per year (reference US price).
- Eligible new subscribers may receive three days of Pro access after explicitly approving an Apple introductory subscription offer in the native app.
- Unless canceled, Apple charges the selected plan after the trial and renews it automatically. Eligibility, localized pricing, taxes, exact billing date and cancellation terms are shown by Apple before approval.
- Cancel through Apple subscription management. Canceling stops future renewals; access follows Apple's verified expiration date and applicable terms.
- An old app-managed trial or past free Send does not authorize an Apple charge. Existing users must explicitly approve a subscription before billing.

## MCP behavior

The hosted MCP server provides 15 tools across eight built-in AI destinations and 38 languages. MCP clients do not initiate Apple billing or create trials. Subscription-gated tools check verified server-side entitlement state; a user-provided plan name is not proof of purchase. Link the Apple purchase to the authenticated Poly-Glot account where supported, then use `get_subscription_status` to confirm access. Tool discovery and other read-only functions may be accessible without Pro, but sends, Compare Mode, BYOM and other restricted actions require verified trial or paid access. No separate MCP subscription is advertised.

## Customer support and disclosure

If a paid customer is locked out, check Apple subscription status, restore purchases where offered, confirm account linking and reconnect the MCP client. Do not buy a second subscription solely to fix an account-linking issue. The App Store purchase sheet is authoritative for price, introductory eligibility and renewal conditions.

Documentation: https://hmoses.github.io/poly-glot-site/privacy-and-pricing.html and https://hmoses.github.io/poly-glot-site/mcp-integrations.html
