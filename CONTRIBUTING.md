# Contributing to Negroni

Negroni is early-stage software. Contributions are welcome when they strengthen
the five-phase product model, preserve evidence, or make agent-driven
advertising safer and more reproducible.

## Before opening a pull request

- Read the root `AGENTS.md` and the README for the phase you are changing.
- Open an issue before a large architectural change or a new vendor adapter.
- Keep client data, customer PII, credentials, cookies, campaign exports, and
  private creative out of the repository.
- Use sanitized fixtures. Never fabricate a successful external action.
- Keep live account operations dry-run and approval-gated by default.

## Local setup

Requirements: Node.js 22.13 or newer and npm 11.

```bash
npm run setup
npm run dev
```

Run the required checks before submitting:

```bash
npm run validate
```

For a documentation-only change, verify every relative link and state clearly
which implementation claims were not re-tested.

## Pull requests

A focused pull request should explain:

- the problem and phase it affects;
- the behavior or contract that changed;
- the checks that passed;
- screenshots for visible interface changes;
- external actions, data migrations, or remaining risks;
- whether the change is backward compatible.

Avoid unrelated cleanup, generated runtime data, local paths, and dependency
caches. Preserve existing output contracts or update their callers, tests, and
documentation together.

## Phase boundaries

- **Research** produces cited evidence and testable opportunities.
- **Creative** produces traceable, reviewed assets.
- **Launch** produces a dry-run diff before an external mutation.
- **Iteration** produces a pre-registered experiment and honest decision.
- **Loop** records every proposal, approval, action, and result.

Changes that bypass those boundaries need an explicit design discussion.
