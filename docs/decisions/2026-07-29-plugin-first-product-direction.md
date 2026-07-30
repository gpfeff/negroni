# Plugin-first product direction

**Status:** accepted and initially implemented
**Date:** 2026-07-29

## Decision

Negroni is an open-source, agent-native advertising system. Its primary
distribution is an installable ChatGPT/Codex plugin, not a standalone web
application. The plugin contains portable workflow skills; a stable Negroni
tool boundary will provide live data and actions; and the existing owner-scoped
Site is the durable campaign workspace.

The five product phases remain unchanged:

1. Research
2. Creative
3. Launch
4. Iteration
5. Loop

Each phase consumes explicit inputs and produces durable, reviewable artifacts
for the next phase. Launch and Loop remain dry-run by default and require exact
approval before spend, publishing, or live account mutation.

## Distribution model

- ChatGPT and Codex use the Negroni plugin.
- Gemini and other compatible agents reuse the same phase skills and stable
  tool contracts through thin host-specific packages.
- Sites provides the normal live workspace for the ChatGPT/Codex distribution.
- The local launcher remains contributor infrastructure and an optional
  self-hosted fallback.

## Public and private boundary

The public repository contains plugin metadata, skills, contracts, schemas,
tests, sanitized examples, Site source, and operational code. Credentials,
provider state, customer data, collected media, private campaign artifacts,
databases, logs, and caches remain outside Git.

One host's connector authorization is never treated as portable to another
host. Every distribution must verify the connected account identity and
preserve missing or revoked access as blocked.

## Initial implementation and honest blockers

The repository now includes a validated plugin manifest, onboarding skill, and
one skill for each phase. The existing Sites project and D1 binding are
preserved. A hosted Negroni MCP server and live provider tools are follow-on
work; until they exist and are authorized, the Site must continue to report
live research and provider operations as blocked.
