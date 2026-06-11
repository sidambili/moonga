# Security

## Reporting a vulnerability

If you find a security issue, please don't open a public GitHub issue.

Email: ambili.sid@gmail.com

Include a description of the issue, steps to reproduce, and the potential impact. I'll respond as soon as I can and keep you updated on the fix.

## Scope

This is a self-hosted tool. The attack surface is primarily:

- The webhook endpoints (`/api/webhooks/*`) — these accept unauthenticated POST requests and should be placed behind a reverse proxy or firewall in production
- API keys stored in the database — stored as-is, so database access = key access
- The auth layer (better-auth) — report issues upstream if they're framework-level

## Out of scope

- Issues on your own self-hosted instance that result from misconfiguration
- Vulnerabilities in third-party dependencies (report those upstream)
