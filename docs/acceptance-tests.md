# Acceptance tests

Automated tests cover:

- partial intake with only a name and one substantive context item;
- every optional field state: answered, unknown, research this, or not applicable;
- exactly one verified Google Doc, one verified Google Sheet, and one Markdown output;
- competitor Sheet naming and Markdown filename rules;
- citation integrity and attributable source IDs;
- secret-like material rejection;
- course, business-loan, MVA, and prior-market example leakage rejection;
- fake Google URLs, failed parity, and incomplete validations.

Visual QA covers the one-page structure, visible runtime blocker, progressive disclosure, exactly three output cards, disabled execution when blocked, desktop/mobile overflow, browser errors, and material accessibility violations.
