# App Store Connect Webhook

## Endpoint

```
POST /webhooks/appstore-connect
```

Hosted as a Neon Function: `webhook/index.mjs`

**Status:** Infrastructure ready. NOT YET DEPLOYED.

## Apple Documentation

- [App Store Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications)
- [App Store Connect Webhooks](https://developer.apple.com/documentation/appstoreconnectapi/app_store/webhooks)

## Authentication Method

**HMAC-SHA256** per [Apple's ASC webhook documentation](https://developer.apple.com/documentation/appstoreconnectapi/configuring-webhook-notifications).

When you register a webhook via the ASC API, you provide a `secret` value. Apple then:
1. Computes HMAC-SHA256 of the POST body using your secret
2. Sends the signature in the header: `x-apple-signature: hmacsha256=<hex-hash>`

The webhook receiver:
1. Reads the raw POST body
2. Computes HMAC-SHA256 using `APPSTORE_WEBHOOK_SECRET`
3. Compares in constant-time against Apple's provided signature
4. Rejects on mismatch with HTTP 401

**This is NOT the same as App Store Server Notifications V2** (which uses JWS-signed payloads). ASC webhooks are a separate system with plain JSON payloads and HMAC authentication.

## Event Types Used

ASC webhook event types (from [WebhookEventType](https://developer.apple.com/documentation/appstoreconnectapi/webhookeventtype)):

| ASC Event Type | `attributes.newValue` | Action | Description |
|---------------|----------------------|--------|-------------|
| `buildBundleProcessingStateUpdated` | `VALID` | `STAGE` | Build processed successfully |
| `buildBundleProcessingStateUpdated` | `FAILED` | `LOG_ONLY` | Build processing failed |
| `appStoreVersionAppVersionStateUpdated` | `READY_FOR_DISTRIBUTION` | `PRODUCTION` | App approved by Apple |
| `appStoreVersionAppVersionStateUpdated` | other | `LOG_ONLY` | Version state transition |
| Ping | — | `PONG` | Test webhook delivery |
| Other | — | `LOG_ONLY` | Recorded but no action taken |

## Payload Format (ASC Webhooks)

```json
{
  "data": {
    "type": "appStoreVersionAppVersionStateUpdated",
    "id": "7c813492-...",
    "version": 1,
    "attributes": {
      "newValue": "READY_FOR_DISTRIBUTION",
      "oldValue": "IN_REVIEW",
      "timestamp": "2025-04-16T05:00:52.745Z"
    },
    "relationships": {
      "instance": {
        "data": { "type": "appStoreVersions", "id": "ad7e6298-..." }
      }
    }
  }
}
```

## Fields Relied On

- `data.type` — event type (e.g., `appStoreVersionAppVersionStateUpdated`)
- `data.id` — unique event ID (used for idempotency)
- `data.attributes.newValue` — new state value
- `data.attributes.oldValue` — previous state value
- `data.relationships.instance.data` — related resource (appStoreVersion or build)

## Bundle ID Filtering

Only events for `ai.polyglot.workspace` are processed. Other bundle IDs are rejected.

## GitHub Dispatch

On STAGE or PRODUCTION events, the webhook triggers a GitHub Actions `repository_dispatch`:

- Event type: `apple-webhook-STAGE` or `apple-webhook-PRODUCTION`
- Payload includes: platform, version, build, parityVersion, commit SHA

## Environment Variables

| Name | Purpose |
|------|---------|
| `APPSTORE_WEBHOOK_SECRET` | Shared secret for webhook authentication |
| `GITHUB_WEBHOOK_TOKEN` | GitHub PAT for repository_dispatch |
| `GITHUB_REPO_OWNER` | Repository owner (e.g., `hmoses`) |
| `GITHUB_REPO_NAME` | Repository name (e.g., `poly-glot-ai-workspace`) |
| `POLYGLOT_APP_BUNDLE_ID` | Expected bundle ID (`ai.polyglot.workspace`) |

## Deployment Policy

See `config/deployment-policy.json`:

- `stageOnBuildComplete: true` — safe default
- `productionOnReadyForDistribution: true` — deploy when Apple approves
- `productionOnBuildComplete: false` — never auto-promote builds to production

## Local Testing

```bash
curl -X POST http://localhost:3000/webhooks/appstore-connect \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: test-secret" \
  -d '{"notificationType":"BUILD_COMPLETE","data":{"bundleId":"ai.polyglot.workspace","platform":"IOS","version":"1.0.3"}}'
```

## Production Endpoint

Not yet deployed. Will be at a Neon Function URL once owner configures secrets and deploys.

## Security

- HTTPS only
- HMAC-SHA256 signature verification (constant-time comparison)
- Idempotent by event ID (in-memory set, bounded to 10K entries)
- No secrets in logs
- No raw signatures in logs
- No private key material in responses
- Proper HTTP status codes (401 for auth failures, 400 for malformed, 500 for server errors)
