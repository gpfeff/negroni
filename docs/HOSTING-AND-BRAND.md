# Negroni hosting and brand decision

Negroni is the product, repository, and public brand. Its late-1950s Madison
Avenue visual direction is an aesthetic, not a separate brand. Do not use
“Mad Men” in public naming, repository metadata, branches intended to remain
public, deployment names, domains, or product copy.

## Hosting model

The GitHub repository is the canonical public source. Negroni is plugin-first,
harness-agnostic at its contracts, and portable across compatible agents.

- The Codex/ChatGPT plugin is the primary distribution and onboarding surface.
- Portable phase skills and stable Negroni tool contracts define shared agent
  behavior; Gemini and other distributions wrap those same contracts.
- The React project is the live Sites workspace, not a separate product.
- Local/self-hosted and managed-hosted deployments must use the same phase,
  artifact, runner, storage, and provider contracts.
- Self-hosting remains an optional supported fallback.
- Codex Sites is the primary hosted workspace for the ChatGPT/Codex
  distribution. Another agent distribution may provide a compatible workspace
  without changing the phase contracts.
- The browser interface must keep credentials server-side and communicate with
  the secure runner through the documented stable contract.
- Scheduled research, Google Workspace publishing, Meta Ads Intelligence, and
  other privileged integrations remain runner-side.

Local development commands alone are not a complete self-hosting release.
Before claiming production self-hosting support, Negroni should provide a
reproducible deployment package, documented environment variables, health
checks, persistent-state boundaries, upgrade guidance, and rollback guidance.

Launch and Loop integrations remain dry-run and approval-gated regardless of
hosting environment.

## Product and provider boundary

The plugin owns discovery and orchestration. Phase skills own the workflow.
The Site owns project state, artifact review, approvals, and provenance.
Infrastructure choices stay behind stable tool and provider adapters.

| Capability | Agent/plugin layer | Workspace/runtime layer |
|---|---|---|
| Product entry | Codex/ChatGPT plugin or compatible agent package | Private live Site |
| Workflow | Portable five-phase skills | Durable artifacts and approvals |
| Live data/actions | Stable Negroni tool contracts | Authorized broker and isolated runner |
| Local fallback | Same contracts through contributor tooling | Local database and private runtime state |

ComfyUI should be the first supported Creative image/video adapter, not a
required Negroni dependency and not a replacement for the product interface.
An operator may configure a local ComfyUI URL, a GPU worker on their network,
or a compatible hosted ComfyUI service. Negroni must submit through a stable
internal generation contract and record the workflow, model, parameters,
outputs, validation results, and limitations in the Creative manifest and
receipt.

The application must remain useful when ComfyUI is absent. Missing generation
providers are shown as an honest configuration blocker; they must not prevent
Research, artifact review, or other locally available work.

## Implementation sequence

1. Ship the repository as a validated Codex/ChatGPT plugin with portable phase
   skills.
2. Keep the existing owner-scoped Site as the live workspace.
3. Implement the authenticated Negroni MCP/tool boundary for campaign data and
   provider actions without weakening approval gates.
4. Package the same skills and tool contracts for Gemini and other compatible
   agents.
5. Retain local/self-hosted tooling as a contributor and fallback path.
