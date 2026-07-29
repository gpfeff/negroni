# MVP acceptance tests

## Automated

- Minimum viable brief and required sentinel behavior
- Internal versus sold/client/marketplace buyer logic and contradictions
- Call, transfer, appointment, application, trial/demo, and custom-event
  conditional questions
- Canonical and package import/export, raw answers, field states, source order,
  contract versions, and source-manifest parity
- Recursive credential, token, signed-URL, and secret-key rejection
- Actual text, magic-byte, ZIP, and OOXML type detection
- Public URL and private-network URL boundaries
- Project and lane state transitions
- Exact ordered `00`–`09` document contract and conditional supporting outputs
- Deterministic fixture integrity, evidence/artifact references, publication
  blocking, and immutable fixture authorization
- Structural-example leak scanning across shipped synthetic data

Run with `npm test`; run the full owning suite with `npm run validate`.

## Visual

Desktop and mobile QA must cover:

1. dashboard and synthetic labeling;
2. all ten intake steps;
3. internal/sold and conversion-specific disclosure;
4. source registration and detected-type presentation;
5. preflight, unknowns, launch gates, and empty allowlist;
6. synthetic run lane states;
7. evidence filtering and limitations;
8. deliverables showing two representative Markdown artifacts, zero verified
   Google Docs, zero parity matches, and no `document-manifest.json`;
9. keyboard focus, overflow, and narrow-screen reflow.
