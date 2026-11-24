# Public portal continuous operation audit — 2026-10-26

AI Hub owns common login, roles, Google/OAuth administration, the gateway and its supervisor. ACAP owns its production backend and exports a local ensurePortalBackend contract from its registered application module.

The existing portal supervisor now calls scripts/ensure-portal-backends.mjs after restoring the Hub backend, gateway and tunnel. The runner loads only the existing administrator-owned module manifest, skips legacy modules without the optional contract, attempts all registered applications, and reports failure without exposing internal exception details. Healthy applications are reused. ACAP's owned launcher performs application startup; the Hub script contains no project-specific Drive IDs or Google credentials.

Tests: 28 existing account/security/proxy tests passed; portal browser login harness passed with synthetic sessions; 2 backend recovery contract tests passed. Operating SQLite backup and quick_check passed with 20 tables. Public unauthenticated account/ACAP management requests returned 401 and private files 403; portal pages and health returned 200 with CSP and HSTS. A running production process was not deliberately killed while a user was active.

Remaining: the current Public Portals Startup shortcut requires Windows sign-in. No boot-before-sign-in Hub/ACAP recovery task was found. Cloudflared has an automatic service, which does not establish application startup readiness. Recurring backup scheduling, off-machine backup and restore rehearsal remain unverified; a fresh consistent backup was made during this audit. OAuth publishing state remains unverified and must be checked in Google Cloud; a successful refresh request does not prove In production status.

ACAP's complete production regression audit and detailed limitations are in that repository's docs/remote-always-on-audit.md. Account information, passwords, API keys and tokens are excluded from this audit. Existing sessions, folders, users and running production processes were retained. The supervisor changes take effect on its next recovery loop without restarting the gateway.
