# Security Policy

## Reporting vulnerabilities

Please report security issues privately using GitHub's **Report a vulnerability** feature in the repository Security tab, if enabled. Do not publish credentials, proof-of-concept exploits, customer data, or security findings in public issues.

## Public MCP interface versus private implementation

This repository currently contains both public MCP integration materials and implementation code. Do not assume a file is confidential because it is undocumented. The repository's MIT license applies to its published licensed contents; moving or removing a file does not revoke rights already granted.

**Preserve in the public MCP distribution:** `server.json`, tool names and schemas, connection instructions, safe examples, public documentation, and metadata needed for GitHub-verified registry publishing.

**Review for migration to a private implementation repository:** entitlement and subscription internals, analytics implementation, deployment-specific configuration, webhook internals, and proprietary business logic. Do not move these files without updating deployment workflows, dependencies, registry publication, and integration tests.

## Secret handling

- Keep production credentials in approved secret stores or platform environment variables, never in Git.
- Use placeholder-only `.env.*.example` files for documentation.
- Scan **all branches, tags, and Git history** with a secret scanner such as Gitleaks before asserting the repository is clear.
- If a credential is found, revoke or rotate it immediately. Removing it from the latest commit is insufficient.
- Review GitHub Actions logs and artifacts for sensitive values.
- Git ignore rules prevent accidental new tracking but do not untrack existing files.

## Security testing required before major backend changes

- Verify authenticated access and server-side entitlement enforcement for all 15 MCP tools.
- Test BYOM URL validation against DNS rebinding, address normalization, IPv4/IPv6 edge cases, and redirect bypasses.
- Verify rate limits, logging redaction, audio upload bounds, and error sanitization.
- Confirm that the remote MCP endpoint continues to work after any repository split.

## Operational safety

Do not change production MCP URLs, Neon Functions, Apple subscription verification, or entitlement behavior as part of a documentation-only security update.
