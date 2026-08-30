# Poly-Glot MCP Usage Analytics — Helper Queries

All queries run against the `mcp_usage_events` table in Neon Postgres.

## Total MCP calls (all time)

```sql
SELECT COUNT(*) FROM mcp_usage_events;
```

## Calls in last 24 hours

```sql
SELECT COUNT(*)
FROM mcp_usage_events
WHERE occurred_at >= now() - interval '24 hours';
```

## Unique users (all time)

```sql
SELECT COUNT(DISTINCT user_key)
FROM mcp_usage_events
WHERE user_key IS NOT NULL;
```

## Unique sessions (all time)

```sql
SELECT COUNT(DISTINCT session_key)
FROM mcp_usage_events
WHERE session_key IS NOT NULL;
```

## Tool usage breakdown

```sql
SELECT tool_name, COUNT(*) AS calls
FROM mcp_usage_events
GROUP BY tool_name
ORDER BY calls DESC;
```

## Daily usage (with unique users)

```sql
SELECT date_trunc('day', occurred_at) AS day,
       COUNT(*) AS calls,
       COUNT(DISTINCT user_key) AS users
FROM mcp_usage_events
GROUP BY 1
ORDER BY 1 DESC;
```

## Client usage breakdown

```sql
SELECT client_name, COUNT(*) AS calls
FROM mcp_usage_events
GROUP BY client_name
ORDER BY calls DESC;
```

## Hourly traffic (last 7 days)

```sql
SELECT date_trunc('hour', occurred_at) AS hour,
       COUNT(*) AS calls
FROM mcp_usage_events
WHERE occurred_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;
```

## Entitlement state distribution

```sql
SELECT metadata->>'entitlementState' AS state,
       COUNT(*) AS calls
FROM mcp_usage_events
WHERE metadata->>'entitlementState' IS NOT NULL
GROUP BY 1
ORDER BY calls DESC;
```

## Locked template attempts

```sql
SELECT tool_name,
       metadata->>'templateName' AS template,
       metadata->>'lockReason' AS reason,
       COUNT(*) AS attempts
FROM mcp_usage_events
WHERE (metadata->>'locked')::boolean = true
GROUP BY 1, 2, 3
ORDER BY attempts DESC;
```

## Pro vs Free usage

```sql
SELECT CASE WHEN (metadata->>'isPro')::boolean THEN 'pro' ELSE 'free' END AS tier,
       COUNT(*) AS calls
FROM mcp_usage_events
WHERE metadata->>'isPro' IS NOT NULL
GROUP BY 1;
```

## Top templates (by build_prompt usage)

```sql
SELECT metadata->>'templateName' AS template,
       COUNT(*) AS builds
FROM mcp_usage_events
WHERE tool_name = 'build_prompt'
  AND (metadata->>'success')::boolean = true
GROUP BY 1
ORDER BY builds DESC
LIMIT 20;
```

## Compare Mode provider popularity

```sql
SELECT provider, COUNT(*) AS uses
FROM mcp_usage_events,
     jsonb_array_elements_text(metadata->'providers') AS provider
WHERE tool_name = 'prepare_compare'
GROUP BY provider
ORDER BY uses DESC;
```

## Language usage

```sql
SELECT metadata->>'uiLanguage' AS lang,
       COUNT(*) AS calls
FROM mcp_usage_events
WHERE metadata->>'uiLanguage' IS NOT NULL
GROUP BY 1
ORDER BY calls DESC;
```

## New users per day

```sql
SELECT first_seen::date AS day,
       COUNT(*) AS new_users
FROM (
  SELECT user_key, MIN(occurred_at) AS first_seen
  FROM mcp_usage_events
  WHERE user_key IS NOT NULL
  GROUP BY user_key
) sub
GROUP BY 1
ORDER BY 1 DESC;
```

---

## Table Schema

```sql
-- mcp_usage_events (already exists in production — DO NOT recreate)
-- id           BIGSERIAL PRIMARY KEY
-- occurred_at  TIMESTAMPTZ
-- event_type   TEXT          -- "tool_call"
-- tool_name    TEXT          -- one of the 7 MCP tools
-- user_key     TEXT          -- SHA-256 hash of auth token (never raw)
-- session_key  TEXT          -- SHA-256 hash of session ID
-- authenticated BOOLEAN
-- source       TEXT          -- "mcp"
-- client_name  TEXT          -- "chatgpt", "claude", "goose", "cursor", "unknown"
-- metadata     JSONB         -- tool-specific context (no secrets/prompts)
```
