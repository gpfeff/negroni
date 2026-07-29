# Negroni web

This package is the top-level Negroni product interface. It presents the five
advertising phases, their durable artifacts, and the current boundary between
working Research foundations and planned downstream modules.

## Run

From the repository root:

```bash
npm run setup
npm run dev
```

Or from this directory:

```bash
npm install
npm run dev
```

## Validate

```bash
npm run typecheck
npm run build
```

The foundation-direction browser checks and screenshots are under [`qa/`](qa/).
They predate the 1959 brand layer and remain as an interaction baseline.
The canonical cross-phase UI reference is [`../docs/UI.md`](../docs/UI.md).

## Current boundary

- The project dialog creates a page-local draft only.
- Phase selection is interactive.
- Research is not yet wired to the separate Phase 1 runner.
- Creative, Launch, Iteration, and Loop expose their contracts but do not
  execute external actions.
- No ad account, campaign, budget, publishing, or traffic integration is
  enabled.

## Visual asset

`public/negroni-madison-hero.png` was generated specifically for this interface.
It frames Negroni as a bright late-1950s Madison Avenue agency lunch: campaign
craft, confidence, and a little swagger without losing the product's approval
boundaries. It contains no people, readable text, logos, or client material.

`public/negroni-five-phase-loop.png` remains the abstract five-phase system
artwork and may be reused in diagrams or product documentation.
