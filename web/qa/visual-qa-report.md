# Negroni web UI QA

Updated: 2026-07-29

## Result

Pass for the current interface scope.

## Viewports

- Desktop: 1440 × 1000
- Mobile: 390 × 844

## Functional checks

- All five phase controls update the active state, phase copy, artifact, owners,
  prerequisite, and status.
- A planned-phase action reports that the phase is not executable and confirms
  that no live action occurred.
- Both project-entry controls open the same local-draft dialog.
- Empty project names keep the create action disabled.
- A valid project name and goal update the local workspace and create a visible
  status notice.
- Escape closes the dialog.
- Keyboard focus stays inside the open dialog and returns to its opener.
- Opening the dialog locks background scrolling and closing it restores
  scrolling.
- The notice can be dismissed.
- No campaign, account, budget, publishing, or traffic action is present.

## Visual checks

- The hero communicates the five-phase loop in the initial desktop and mobile
  view.
- No horizontal page overflow at either viewport.
- Desktop hero copy, generated loop artwork, system readout, and primary actions
  are visible without clipping.
- The complete desktop phase workspace fits inside one 1440 × 1000 viewport
  after following the phase anchor.
- The mobile phase rail intentionally scrolls horizontally and advances to the
  selected phase.
- The mobile dialog fits inside the viewport and remains internally scrollable
  when required.
- The densest tested state—Loop selected on mobile—keeps the artifact, owners,
  prerequisite, and action readable.
- Browser console: zero errors and zero warnings after the missing favicon was
  fixed.

## Reviewed screenshots

- `screenshots/desktop-hero.png`
- `screenshots/desktop-workspace.png`
- `screenshots/mobile-hero.png`
- `screenshots/mobile-workspace.png`
- `screenshots/mobile-project-dialog.png`

## Remaining limitations

- The project draft is intentionally page-local and is not persisted.
- Research is represented in the top-level interface but is not yet wired to
  the existing Phase 1 runner.
- Creative, Launch, Iteration, and Loop expose honest contracts only; they are
  not executable.
- A formal automated Axe scan is not yet part of the top-level web package.
