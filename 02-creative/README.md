# Phase 2: Creative

Creative turns a Research brief into traceable image and video ads. The phase
is not just media generation: it defines why each concept exists, what it tests,
how it fits the channel, and what must be reviewed before launch.

## Inputs

- an approved immutable `creative-brief.json` revision and matching SHA-256;
- its validated `negroni-research-creative-handoff` pointer, evidence IDs,
  unknowns, approval timestamp, and originality rule;
- client brand assets and usage rules;
- channel, placement, format, duration, and safe-area requirements;
- required disclosures and prohibited claims;
- production budget, model/tool permissions, and review owners.

## Workflow

1. Select a customer segment, awareness stage, offer, and hypothesis.
2. Generate distinct concepts before generating minor variants.
3. Develop hooks, scripts, copy, storyboards, and visual direction.
4. Produce image and video assets with platform-specific variants.
5. Validate dimensions, duration, text, audio, captions, claims, and branding.
6. Record provenance and obtain the required creative approval.

## Outputs

1. `creative-strategy.md` — concept rationale and portfolio of angles;
2. `creative-manifest.json` — assets, formats, provenance, and review state;
3. `assets/` — approved image, video, audio, caption, and thumbnail files;
4. `launch-copy.json` — headlines, primary text, descriptions, and calls to
   action;
5. `creative-receipt.json` — validations, models/tools used, and limitations.

## Design rules

- Every concept must map to a Research hypothesis.
- Every generated asset must have an identifier and provenance record.
- Concept diversity comes before superficial variations.
- Platform crops and encodes derive from a master asset where practical.
- Accessibility, disclosures, and safe-area checks are release requirements.
- Competitor evidence may inspire a pattern, never a copied execution.
- Before Creative starts, recompute the exact brief SHA-256 and fail closed if
  the approval status, Research revision ID/SHA-256, brief SHA-256, evidence
  IDs, or approval timestamp is missing or changed.
- Create new copy, composition, footage, identity, and proof. A public
  durability signal never authorizes competitor asset, copy, claim, or identity
  reuse.
- Synthetic people, testimonials, demonstrations, and claims must be visibly
  reviewed for deception and policy risk.

## Initial production build plan

- Define the creative manifest and asset-provenance schemas.
- Support one image workflow and one short-form vertical video workflow.
- Add deterministic format, duration, safe-area, caption, and file-size checks.
- Add concept and claim review gates.
- Produce a local contact sheet and review page.
- Export a Launch-ready package without touching an ad account.

## Exit criteria

Creative is ready for Launch when every asset is approved, correctly formatted,
traceable to a hypothesis, paired with channel copy, and free of unresolved
validation blockers.

## Learning Core input and output

Creative retrieves the selected brand's current learning versions and keeps
candidate, supported, trusted, contradicted, and superseded states visible. A
creative concept references the exact evidence and hypothesis it tests. Asset
bytes stay in private content-addressed storage; the catalog retains SHA-256
references and provenance. Creative output never promotes a learning or
authorizes publication.
