# 405 Resilience Runbook

## Overview
This runbook documents the resilience system added to Poly-Glot AI Workspace MCP server to handle HTTP 405 (Method Not Allowed) errors and other transient failures gracefully.

## Root Cause
The 405 errors originate from **Goose → Anthropic API** (`https://api.anthropic.com/v1/messages`), NOT from Poly-Glot. When Anthropic's API transiently returns 405, Goose crashes and loses in-progress development work.

**Poly-Glot's API was never the source.** See `docs/405-root-cause-report.md` for full evidence.

## What Was Added

### 1. Route Contract Validation (`src/resilience.js`)
- Centralized method/route contract for all Poly-Glot endpoints
- Invalid method → immediate 405 with `Allow` header and diagnostic JSON
- No method guessing or blind POST↔GET conversion
- OPTIONS/CORS preflight handled separately from business requests

### 2. Retry Classifier (`src/resilience.js`)
- **Never retry 405** — it's a contract problem, not transient
- **Never retry 400/401/403/404/409/422** — deterministic client errors
- **Retry with backoff**: 408, 429 (respects Retry-After), 5xx for GET/HEAD
- **Conditional for mutations**: POST/PATCH/PUT/DELETE on 5xx flagged but NOT auto-replayed
- Budget: max 2 retries, exponential backoff with jitter, 10s cap

### 3. 405 Diagnostic (`src/resilience.js`)
- Typed `METHOD_NOT_ALLOWED` response with:
  - Attempted method, allowed methods, request ID, timestamp
  - Clear `action: "stopped safely; no mutation replayed"`
- Never auto-resends with a different method

### 4. Checkpoint/Resume (`src/resilience.js`)
- `saveCheckpoint(taskId, data)` — saves completed steps, next action, files changed
- `loadCheckpoint()` — resumes from last safe point
- `saveFailure(error, context)` — records failure with redacted context
- Stored in `.goose/` directory (gitignored)

### 5. Circuit Breaker (`src/resilience.js`)
- Keyed by `method:pathname:statusCategory`
- Opens after 5 consecutive failures
- 30-second cooldown, then half-open probe
- Does NOT affect unrelated healthy operations
- `recordCircuitSuccess()` resets immediately

### 6. Structured Logging with Redaction (`src/resilience.js`)
- JSON-structured log entries with timestamp, level, event, request_id
- **Always redacted**: Authorization, Cookie, API keys, tokens, receipts, signed transactions, identity tokens, passwords, secrets
- Query strings redacted from paths
- No PII or prompt content logged

### 7. Server Integration (`server.js`)
- Request ID assigned to every request (`X-Request-Id` header)
- Method contract checked before routing
- Invalid methods get 405 + Allow header immediately
- 404s logged with structured context
- Zero changes to existing API semantics

## Testing
```bash
# Run resilience tests (68 tests)
node scripts/test-resilience.mjs

# Run existing baseline checks
npm run check

# Run both
npm test
```

## Files Changed
| File | Change |
|------|--------|
| `src/resilience.js` | NEW — all resilience primitives |
| `scripts/test-resilience.mjs` | NEW — 68-test regression suite |
| `server.js` | MODIFIED — import resilience, add contract check + request ID |
| `docs/405-root-cause-report.md` | NEW — root cause evidence |
| `docs/405-resilience-runbook.md` | NEW — this file |
| `.gitignore` | MODIFIED — add `.goose/` |
| `package.json` | MODIFIED — add test script |

## Rollback Instructions
1. Revert `server.js` to remove the resilience import and contract check (lines added near imports and in httpServer handler)
2. Delete `src/resilience.js`
3. Delete `scripts/test-resilience.mjs`
4. Delete `docs/405-root-cause-report.md` and `docs/405-resilience-runbook.md`
5. Revert `.gitignore` and `package.json` changes
6. Run `npm run check` to confirm baseline still passes

No API contracts, entitlement logic, subscription behavior, or MCP tool schemas were changed.

## Provider Limitation (Unresolved)
The Anthropic API 405 is outside Poly-Glot's control. When Goose's provider returns 405:
- Goose should not retry the same request
- Goose should preserve session state
- This is a Goose/provider issue, not a Poly-Glot issue
- Recommended: Report to Goose team / Anthropic if recurring
