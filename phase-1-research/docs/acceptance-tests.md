# Acceptance tests

Automated tests cover:

- partial intake with only a name and one substantive context item;
- every optional field state: answered, unknown, research this, or not applicable;
- canonical-engine and exact external-action authorization enforcement;
- malformed or expanded field-set rejection before runner forwarding;
- bounded, path-safe attachment manifests and upload-manifest matching;
- required nightly Meta Ads Intelligence request and valid timezone enforcement;
- complete-or-limited receipts for every required research lane;
- active monitoring receipts and honest partial results with explicit monitoring blockers;
- exactly one verified Google Doc, one verified Google Sheet, and one Markdown output;
- master Doc, competitor Sheet, and Markdown naming rules;
- citation integrity and attributable source IDs;
- secret-like material rejection;
- course, business-loan, MVA, and prior-market example leakage rejection;
- fake Google URLs, failed parity, and incomplete validations.

Visual QA covers the one-page structure, visible runtime blocker, progressive
disclosure, exactly three output cards, nightly-monitoring receipt copy,
disabled execution when blocked, desktop/mobile overflow, browser errors, and
material accessibility violations.
