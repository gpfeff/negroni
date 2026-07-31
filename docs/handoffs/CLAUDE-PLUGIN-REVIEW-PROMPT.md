# Claude plugin review prompt

Use this prompt for a detailed, read-only review of the plugin codebase.

```text
Perform a thorough, read-only code review of this plugin.

First, read all repository and directory-level instructions (including AGENTS.md), then inspect the complete relevant codebase—not only the recently changed files.

Look for:
- Functional bugs, edge cases, and error-handling gaps
- Security, privacy, secrets-handling, and unsafe-input issues
- Incorrect assumptions, race conditions, data-loss risks, and reliability problems
- API/design inconsistencies and maintainability concerns
- Missing or weak tests, including important untested paths
- Documentation, configuration, packaging, and integration issues
- Opportunities to simplify or improve code quality—but avoid subjective nitpicks

Do not make any edits. Do not run destructive commands or external actions.

Return a detailed, prioritized review that I can hand back to another engineer to implement. For each finding include:
1. Priority: P0 / P1 / P2 / P3
2. Clear title
3. Exact file path and line number(s)
4. What is wrong and why it matters
5. A concrete recommended fix
6. Any test coverage that should be added

Separate confirmed issues from suggestions and from areas you checked but found acceptable. Be skeptical: challenge assumptions and look for things a primary implementer may have missed. Do not invent findings; say when evidence is insufficient.
```

To focus on current uncommitted work, append:

```text
Prioritize the current diff and its direct dependencies, but still flag pre-existing issues only when they materially affect the changed behavior.
```
