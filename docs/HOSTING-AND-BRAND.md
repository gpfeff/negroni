# Negroni hosting and brand decision

Negroni is the product, repository, and public brand. Its late-1950s Madison
Avenue visual direction is an aesthetic, not a separate brand. Do not use
“Mad Men” in public naming, repository metadata, branches intended to remain
public, deployment names, domains, or product copy.

## Hosting model

The GitHub repository is the canonical source. Negroni must remain
harness-agnostic and portable across hosting environments.

- Negroni is one React product, not separate local and hosted interfaces.
- Local/self-hosted and managed-hosted deployments must use the same phase,
  artifact, runner, storage, and provider contracts.
- Self-hosting is a first-class supported option, not an afterthought.
- Codex Sites is an optional hosted deployment target for demos, evaluation,
  or a compatible thin client. It must not define Negroni's architecture.
- Operators may choose another compatible host.
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

The Negroni interface owns the five-phase workflow, project state, artifact
review, approvals, and provenance. Infrastructure choices stay behind stable
adapters so the interface and phase contracts do not fork by deployment mode.

| Capability | Local or self-hosted | Managed hosted |
|---|---|---|
| Product interface | Same React application | Same React application |
| Durable state | Local database and filesystem-compatible storage | Managed database and object storage |
| Secure execution | Local or operator-managed runner | Managed isolated runner |
| Creative generation | Optional local or LAN provider | Optional managed or cloud provider |

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

1. Unify the five-phase workspace and Research experience into one React
   application and shared visual system.
2. Stabilize storage, runner, and provider contracts without deployment-specific
   UI branches.
3. Ship a reproducible self-hosted package with health checks and persistent
   state documentation.
4. Deploy the same application and contracts as the managed hosted product.
5. Add ComfyUI through the Creative provider contract with local, network, and
   hosted configuration paths.
