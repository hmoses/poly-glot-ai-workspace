# Owner Setup Guide

## App Store Connect — Webhook Configuration

For each Poly-Glot app record (iOS and macOS share bundle ID `ai.polyglot.workspace`):

1. Open [App Store Connect](https://appstoreconnect.apple.com)
2. Go to **Users and Access** → **Integrations** → **Webhooks**
3. Click **Add Webhook**
4. Select the Poly-Glot app
5. Paste the production webhook endpoint URL (provided after Neon deployment)
6. Configure the shared secret (generate a strong random value)
7. Select event types: **Build Processing Complete**, **App Version Ready for Distribution**
8. Save
9. Use Apple's **Send Test Notification** to verify
10. Check receiver logs for successful event receipt
11. Verify GitHub workflow was triggered

If iOS and macOS are separate App Store Connect records, configure both with the same webhook endpoint.

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
