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

The webhook verifies an `X-Webhook-Secret` header against `APPSTORE_WEBHOOK_SECRET` environment variable.

Apple's App Store Server Notifications V2 uses JWS-signed payloads. The receiver parses the signed notification but the primary auth gate is the shared secret header.

## Event Types Used

| Apple Event | Action | Description |
|------------|--------|-------------|
| Build `COMPLETE` | `STAGE` | Build upload processed → validate + stage |
| Version `READY_FOR_DISTRIBUTION` | `PRODUCTION` | App approved → production eligible |
| Other | `LOG_ONLY` | Recorded but no action taken |

## Payload Fields Relied On

- `notificationType`
- `data.bundleId` — must match `POLYGLOT_APP_BUNDLE_ID`
- `data.platform` — iOS or macOS
- `data.version` — marketing version
- `data.buildState` or `data.versionState`

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
- Shared secret validation
- Bundle ID filtering
- Idempotent by event ID (planned)
- Rate limiting (planned)
- No secrets in logs
- No private key material in responses
