# Negroni UI system

This document is the canonical UI reference for Negroni. Read it before
building or reshaping a Negroni interface, including Phase 1 Research.

The working implementation lives in [`../web/`](../web/). The shorter
implementation rationale lives in [`../web/DESIGN.md`](../web/DESIGN.md).

## Product character

Negroni should feel like a sharp late-1950s Madison Avenue agency inside a
compact modern AI workspace: witty, optimistic, tactile, and operational. It
should not look like a generic AI dashboard, a dark cocktail bar, or a
costume-party version of the past.

The name informs the cocktail-glass mark, vermouth-and-aperitivo palette, and
three-martini-lunch wit. The product remains grounded in campaign artifacts,
pitchbooks, paper trails, approvals, and an explicit five-phase learning loop.

## The screen's job

Every screen should make these answers visible:

1. Which campaign or project is being changed?
2. Which of the five phases is active?
3. What evidence entered the phase?
4. What durable artifact will leave it?
5. What is ready, planned, blocked, or waiting?
6. What external action would require approval?

## Visual tokens

### Color

| Token | Value | Use |
|---|---|---|
| Ink | `#1d1b18` | Primary text, outlines, and hard shadows |
| Cream paper | `#f4f0e7` | Main application field |
| Paper light | `#fffdfa` | Working surfaces and phase contracts |
| Aperitivo orange | `#e85a36` | Primary actions and creation energy |
| Vermouth burgundy | `#70283c` | Research, evidence, and major brand fields |
| Olive green | `#6c7951` | Safe local state and measured progress |
| Brass | `#d9a746` | Highlights, marks, and optimistic emphasis |
| Mineral teal | `#315f7b` | Launch and delivery systems |

Use accents to encode a real phase or state. Do not scatter them as decoration.
Live-action warnings and destructive states need their own explicit treatment
when those capabilities are introduced.

### Typography

- **Display and body:** Manrope Variable for thesis statements, forms,
  explanations, and operational copy.
- **Utility:** IBM Plex Mono for phase numbers, statuses, file names, receipts,
  and system metadata.

Display type can be assertive, but operational copy must remain plain and
specific. Avoid clever labels when a familiar action verb is clearer.

### Shape and depth

- Use 12–20px radii for major working surfaces and restrained soft shadows.
- Use 6–9px radii for controls, chips, inputs, and small nested surfaces.
- Avoid large collections of floating rounded cards.
- Use blur only when it clarifies layers such as a sticky header or modal.

### Product scale

- Desktop masthead: 64px; mobile masthead: 58px.
- Header actions: 32–34px; primary content actions: 38–42px.
- Desktop hero type: 46–57px depending on viewport; body copy: 15–17px.
- Operational section headings: 32–50px; card and control labels: 11–15px.
- Prefer 64–104px section padding over poster-scale empty space.

## Signature element

Negroni's signature artwork is a bright 1950s agency lunch table containing a
Negroni, an open campaign pitchbook, and the tools of the trade:

[`../web/public/negroni-madison-hero.png`](../web/public/negroni-madison-hero.png)

Use it once, at product level. The cocktail-glass mark, print texture, strong
outlines, and period typography carry the identity elsewhere. The original
five-piece system artwork remains available for process diagrams:
[`../web/public/negroni-five-phase-loop.png`](../web/public/negroni-five-phase-loop.png).

## Application structure

The top-level UI establishes these reusable patterns:

- sticky product masthead;
- campaign identity and local/live state;
- five-phase selector;
- selected phase contract;
- a Tools area for cross-phase operators such as Draper;
- explicit input and output artifacts;
- next honest action;
- durable artifact handoff;
- approval-aware project dialog;
- blocked and planned states that do not imply execution.

Phase 1 should reuse these patterns rather than inventing a second Negroni
brand. Its intake may remain focused, but it should visually connect Research
to the larger five-phase system.

Draper is not a sixth phase. It belongs under Tools as the conversational
control plane across all five phases. Its screen must distinguish evidence,
freshness, assumptions, limitations, proposed changes, recorded decisions, and
completed external actions. A hosted Site must not imply that it can read a
machine-local database or vault from browser code.

## Phase language

| Phase | Active verb | Primary artifact |
|---|---|---|
| Research | Find the signal | `research-brief.md` |
| Creative | Make the argument | `creative-manifest.json` |
| Launch | Prepare the delivery | `launch-diff.md` |
| Iteration | Isolate the lesson | `experiment-result.json` |
| Loop | Compound the learning | `learning-ledger.jsonl` |

Keep these names stable unless the underlying phase contract changes.

## Status language

Use factual states:

- Local draft
- In progress
- Planned
- Waiting
- Blocked
- Ready for review
- Approved
- Applied
- Partial
- Failed
- Inconclusive

Do not use “complete,” “live,” “published,” “winning,” or “optimized” unless the
system has evidence for that exact state.

## Interaction rules

- Every action must say what it does.
- Creating a draft must never imply that a campaign was launched.
- Planned-phase controls should explain the prerequisite instead of faking an
  executable flow.
- External mutations need a dry-run diff, exact approval, readback, and receipt.
- Forms keep their primary action disabled until minimum valid input exists.
- A modal traps keyboard focus, closes with Escape, locks background scrolling,
  and returns focus to its opener.
- Selected phases use `aria-pressed`; status updates use an appropriate live
  region.
- Unknown, blocked, partial, and inconclusive states stay visible.

## Responsive behavior

### Desktop

- The thesis and five-piece loop share the initial viewport.
- The complete phase selector and selected contract should fit within a
  1440 × 1000 review viewport when opened through the workspace anchor.
- Phase selection is vertical beside the contract.

### Mobile

- Preserve the thesis, starting action, approval statement, and the beginning
  of the signature artwork in the initial 390 × 844 view.
- The phase selector becomes a horizontal rail with a visibly clipped next card
  to communicate scrollability.
- Selecting an off-screen phase advances the rail and brings its contract into
  view.
- Dialogs remain inside the viewport and may scroll internally.
- Page-level horizontal overflow is always a defect.

## Copy rules

- Write from the operator's point of view.
- Prefer concrete verbs: Create, Review, Approve, Apply, Pause.
- Keep a control's label consistent with the resulting status.
- Explain the next action and its prerequisite.
- State limitations without apology or vague error language.
- Never invent performance, coverage, authorization, or completion.

## Phase 1 guidance

When building Phase 1 Research:

- keep the three Cs visible: Client, Customer, Competitors;
- show supplied evidence separately from unknowns and research questions;
- make Meta Ads Intelligence one competitor source, not the entire phase;
- expose the resulting Research artifact and its source coverage;
- preserve the existing secure-runner blocker honestly;
- do not turn the focused intake into a generic dashboard;
- provide a clear handoff into Creative without pretending Creative is ready.

## Assets and implementation

- Main application: [`../web/src/App.tsx`](../web/src/App.tsx)
- CSS and tokens: [`../web/src/styles.css`](../web/src/styles.css)
- 1959 brand layer: [`../web/src/brand-1959.css`](../web/src/brand-1959.css)
- Generated Madison Avenue hero:
  [`../web/public/negroni-madison-hero.png`](../web/public/negroni-madison-hero.png)
- Generated loop diagram:
  [`../web/public/negroni-five-phase-loop.png`](../web/public/negroni-five-phase-loop.png)
- Canonical Negroni icon (glass on navy; reuse for app, plugin, and favicons):
  [`../app/public/negroni-glass-icon-v2.webp`](../app/public/negroni-glass-icon-v2.webp)
- Web favicon derivative:
  [`../web/public/favicon.png`](../web/public/favicon.png)
- Foundation QA report:
  [`../web/qa/visual-qa-report.md`](../web/qa/visual-qa-report.md)
- Pre-refresh interaction screenshots:
  [`../web/qa/screenshots/`](../web/qa/screenshots/)

## Required UI checks

Before calling a Negroni screen ready:

1. Run the package typecheck and production build.
2. Exercise every visible control with Playwright.
3. Inspect desktop at 1440 × 1000.
4. Inspect mobile at 390 × 844.
5. Test the densest meaningful state, not only the empty state.
6. Verify no page-level horizontal overflow.
7. Review screenshots for clipping, weak contrast, unclear hierarchy, and
   misleading states.
8. Confirm keyboard focus, Escape behavior, and focus restoration.
9. Confirm zero new browser console errors.
10. Record implementation blockers and non-executable actions.
