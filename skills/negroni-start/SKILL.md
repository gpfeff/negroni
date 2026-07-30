---
name: negroni-start
description: Open, create, or orient a Negroni campaign workspace. Use when a user installs Negroni, asks to start or resume Negroni, wants a live private Site, needs account readiness, or asks what phase and action come next.
---

# Start Negroni

Treat Negroni as an agent-native system with a live Site, not as a standalone app the user must operate or host manually.

## Start or resume

1. Reuse an existing Negroni Site or project when one is linked. Never replace its deployment identity, database, or stored artifacts.
2. If no workspace exists and the host provides Sites, create a private Negroni Site from the packaged `app/` project. Keep access owner-only until the user explicitly chooses a broader audience.
3. Identify the authenticated user and each requested connected source before reading data. Mark a missing, revoked, or mismatched connection as `blocked` or `not checked`.
4. Read the current campaign, phase artifacts, approval state, and last valid receipt.
5. Present the current phase, what is ready, what is blocked, and one next honest action.

## Data boundary

- Keep plugin code, schemas, and sanitized examples public-compatible.
- Keep credentials, provider state, customer data, collected media, and private artifacts outside source control.
- Use host connectors or Negroni tools only within their granted account scope. One host's connector session is not portable to another host.
- Never put secret values in prompts, Site content, logs, artifacts, or repository files.

## Operating boundary

Draft, research, and validate without external mutation. Require explicit approval for the exact diff before publishing creative, submitting forms, changing budgets, mutating an ad account, or launching traffic.

If a live tool, Site capability, or connection is unavailable, preserve that blocker and continue only with work that can be completed honestly.
