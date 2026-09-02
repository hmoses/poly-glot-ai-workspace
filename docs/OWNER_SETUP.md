# Owner Setup Guide

## App Store Connect — Webhook Configuration

For each Poly-Glot app record (iOS and macOS share bundle ID `ai.polyglot.workspace`):

Webhooks are created via the [ASC API](https://developer.apple.com/documentation/appstoreconnectapi/configuring-webhook-notifications), not the ASC web UI.

1. Generate a strong random secret (e.g., `openssl rand -hex 32`)
2. Store it as `APPSTORE_WEBHOOK_SECRET` in GitHub Secrets and Neon env vars
3. Create the webhook via ASC API:
   ```bash
   curl -X POST https://api.appstoreconnect.apple.com/v1/webhooks \
     -H "Authorization: Bearer $ASC_JWT" \
     -H "Content-Type: application/json" \
     -d '{
       "data": {
         "type": "webhooks",
         "attributes": {
           "enabled": true,
           "eventTypes": [
             "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED",
             "BUILD_BUNDLE_PROCESSING_STATE_UPDATED"
           ],
           "name": "PolyGlot Auto-Sync",
           "secret": "<your-secret>",
           "url": "<production-webhook-url>/webhook"
         },
         "relationships": {
           "app": { "data": { "type": "apps", "id": "6804499285" } }
         }
       }
     }'
   ```
4. Test with a ping: `POST /v1/webhookPings` with the webhook ID
5. Check receiver logs for `PONG` response
6. Verify GitHub workflow was triggered

**Authentication:** Apple uses HMAC-SHA256. Apple hashes the POST body with your secret and sends the signature in `x-apple-signature: hmacsha256=<hex>`. The receiver recomputes and compares in constant-time.

## GitHub — Repository Secrets

Add these secrets in **Settings → Secrets and variables → Actions**:

| Secret Name | Purpose |
|-------------|---------|
| `APPSTORE_WEBHOOK_SECRET` | Shared secret matching ASC webhook config |
| `GITHUB_WEBHOOK_TOKEN` | PAT with `repo` scope for repository_dispatch |

## GitHub — Environments

| Environment | Purpose | Protection |
|-------------|---------|------------|
| `production` | Production MCP deployment | Required reviewers (optional) |
| `staging` | Staging validation | None |

## GitHub — Workflows

| Workflow | File | Trigger |
|----------|------|---------|
| Parity Check | `.github/workflows/parity-check.yml` | Push to main, PRs |
| MCP Auto-Sync | `.github/workflows/polyglot-mcp-autosync.yml` | repository_dispatch from webhook |
| Registry Publish | `.github/workflows/publish-mcp-registry.yml` | v*.*.* tags |

### Manual Dry Run

```bash
gh workflow run polyglot-mcp-autosync.yml \
  --field platform=ios \
  --field version=1.0.3 \
  --field target=staging
```

### Disable Automatic Promotion

Set `productionOnReadyForDistribution: false` in `config/deployment-policy.json`.

### Manual Recovery Deploy

```bash
cd /path/to/poly-glot-ai-workspace
neonctl functions deploy mcp
```

## Neon — Runtime Configuration

### Deployment Command

```bash
neonctl functions deploy mcp
```

### Required Runtime Variables (names only)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API for cross-platform language tools |
| `NEON_FUNCTION` | Set to `true` for Neon Functions handler |

### Endpoints

| Endpoint | URL |
|----------|-----|
| Health | `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/` |
| MCP | `https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech/mcp` |
| Entitlements | `https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech/` |

### Rollback

To roll back to a previous deployment:

1. `git checkout <known-good-commit>`
2. `neonctl functions deploy mcp`
3. Verify health endpoint
4. Verify tools/list returns expected count
5. Verify entitlement gates

### Verification Query

```sql
SELECT COUNT(*) FROM mcp_usage_events;
SELECT tool_name, COUNT(*) FROM mcp_usage_events GROUP BY tool_name ORDER BY count DESC;
```

## Definition of Done

A real App Store Connect webhook event must:
1. Hit the production webhook endpoint
2. Pass authentication
3. Identify the correct Poly-Glot app
4. Trigger the correct GitHub workflow
5. Run parity + MCP test suites
6. Follow staging/production policy
7. Record result

Until this is verified end-to-end, auto-sync status is **BLOCKED — OWNER WEBHOOK SETUP REQUIRED**.
