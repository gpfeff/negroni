# Lead Generation Intelligence Workspace

A local-first evidence workbench over the canonical
`lead-generation-ads-discovery-intelligence` skill.

The web app owns structured intake, device-local project state, source metadata,
preflight, lane state, evidence review, and delivery status. The shared skill
continues to own the research method, evidence rules, platform method,
two-sided model, and deliverable contract.

## Product boundary

- Real local execution uses Codex App Server over stdio through a localhost-only
  companion.
- The Codex turn uses a named permission profile: read-only filesystem access
  limited to this project and the canonical skill, with network access for
  research.
- The hosted preview exposes only a visibly synthetic deterministic fixture.
- Local-file intake inspects type and stores metadata only; file bytes are not
  saved or sent to the MVP executor.
- No campaign, spend, traffic, outreach, purchase, form submission, call,
  routing, Google Docs publication, or other live mutation is implemented.
- `document-manifest.json` is not created until native Google Docs exist and
  have been read back.

## Commands

```bash
npm install
npm run dev
npm run dev:runtime
npm run validate
```

Run `npm run dev` and `npm run dev:runtime` in separate terminals for local real
execution. The companion binds only to `127.0.0.1:4317`.

## Canonical locations

- Mac project:
  `/Users/greg-mac-mini/Documents/projects/lead-generation-intelligence-workspace`
- Linux peer:
  `/home/greg/Documents/projects/lead-generation-intelligence-workspace`
- Shared skill:
  `/Users/greg-mac-mini/Documents/skills/lead-generation-ads-discovery-intelligence`

See [product decision](docs/product-decision.md),
[architecture](docs/architecture.md), and
[acceptance tests](docs/acceptance-tests.md).
