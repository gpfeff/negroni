---
name: negroni-creative
description: Turn an approved Negroni Research package into traceable image and video advertising concepts and assets. Use for Phase 2 strategy, hooks, scripts, copy, storyboards, variants, asset generation, provenance, format validation, or creative approval.
---

# Negroni Creative

Turn approved evidence into original, testable creative without claiming that generated work is published or performing.

## Required inputs

- Approved `creative-brief.json` whose exact bytes match the supplied SHA-256.
- A `negroni-research-creative-handoff` pointer containing the approved Research revision ID/SHA-256, creative-brief SHA-256, approval timestamp, evidence IDs, unknowns, and originality rule.
- Brand assets, usage rules, disclosures, prohibited claims, and review owner.
- Channel, placement, format, duration, safe-area, production-budget, and tool permissions.

Stop with a clear blocker when the Research package is missing or no longer matches its approval fingerprint.

Reject pending/rejected approval, a changed revision ID, any SHA-256 mismatch, missing cited evidence, or a handoff that permits competitor asset/copy reuse. Approval of one revision never carries forward to modified Research.

## Workflow

1. Recompute the exact creative-brief fingerprint and validate the approved Research pointer before reading hypotheses.
2. Select a segment, awareness stage, offer, and declared hypothesis, carrying its evidence IDs and unknowns.
3. Develop original concepts before superficial variants. Create new copy, composition, footage, identity, and proof; do not reproduce competitor assets or claims.
4. Produce hooks, scripts, copy, storyboards, and visual direction.
5. Generate only the assets authorized by the user and available tools.
6. Validate format, duration, safe areas, captions, accessibility, branding, disclosures, and claims.
7. Record model, tool, source, prompt, transformation, evidence IDs, unknowns, and review provenance.
8. Obtain creative approval before preparing a Launch package.

## Durable outputs

Create or update:

1. `creative-strategy.md`
2. `creative-manifest.json`
3. `assets/`
4. `launch-copy.json`
5. `creative-receipt.json`

Competitor evidence may inform patterns but never authorizes copied execution. Creative approval does not authorize publishing or spend.

## Learning Core contract

Retrieve only the selected brand's applicable evidence and current learning versions. Keep `candidate`, `supported`, `trusted`, `contradicted`, and `superseded` states visible in the creative rationale. Creative concepts may test a learning; model output does not promote it. Record asset provenance with content-addressed references and keep large media outside database rows.
