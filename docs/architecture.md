# Architecture

```text
One-page browser intake
        |
        v
Same-origin /api/run boundary
        |
        v
Configured secure runner
        |
        +-- canonical lead-generation-ads-discovery-intelligence skill
        +-- public research tools
        +-- native Google Doc and Sheet connector
        |
        v
Strict response validation
        |
        +-- Open Google Doc
        +-- Open Google Sheet
        +-- Download Markdown
```

The browser receives no runner token. Attachments are forwarded for the active request and are not persisted by the page. The app rejects noncanonical engines, extra or missing outputs, non-Google links, unverified native files, filename drift, failed parity/evidence checks, unresolved citations, secret-like material, and structural-example leakage.

The current Sites environment has no configured secure runner or Google Workspace connector. Its honest runtime state is `blocked`; it does not simulate research.
