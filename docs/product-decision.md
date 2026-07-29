# Product decision

## Recommendation

Build a thin local-first web workspace over the shared skill.

This wins because the research method already exists and should remain
versioned in one place, while the missing product value is durable intake,
source roles, visible unknowns, independent lane state, reviewable evidence,
and honest delivery status.

## Alternatives

| Surface | Strength | Why it loses for this MVP |
|---|---|---|
| Skill only | Best canonical method and portability | No durable project state, guided correction, source inventory, or evidence-review workspace |
| Plugin only | Useful future packaging and distribution | Packages capabilities but does not define the core product or state model |
| Standalone agent only | Flexible execution and tools | Hides normalized inputs, blockers, evidence context, and publication parity inside a conversation |
| Thin workspace | Preserves the skill while adding the missing product controls | Requires a small adapter and explicit fixture/real-runtime split |

## Narrow MVP

The MVP is a Vinext/React single workspace with device-local saved state, a
localhost-only Node companion, a real Codex App Server adapter, and one neutral
synthetic fixture for hosted preview and CI. It has no database, account model,
billing, team permissions, or live-action API.

Codex App Server is the supported local integration surface used here, with an
explicit skill item and structured output schema. It remains an experimental
surface, so the adapter is isolated behind a small contract and fails closed
when the exact skill or permission profile is unavailable.
