# Optional local and private-host development

Negroni is plugin-first and uses a private live Site as its normal workspace.
This guide preserves two contributor and self-hosted fallback modes:

| Mode | Negroni runs on | You browse from |
| --- | --- | --- |
| **Local** | The same computer you use | `http://127.0.0.1:3000` on that computer |
| **Private remote host** | A trusted host, such as a Mac mini | A client browser through a local-only SSH tunnel |

Both modes keep the workspace and credential bridge private. They are not the
default plugin onboarding path or a managed-hosting guide. For the product
hosting model and its current limitations, read
[Hosting and brand decision](HOSTING-AND-BRAND.md).

## Shared requirements

- Node.js 22.13 or newer and npm 11.
- A trusted machine you administer when using private remote-host mode.
- Native sign-in for any provider you choose to connect. Do not copy API keys,
  OAuth tokens, cookies, or credentials into the browser, shell history, or
  repository.

The installable local package is not published to npm yet. Build it from a
trusted checkout until an explicit publishing decision is made.

## 1. Run Negroni on the same machine

### Full local runtime from a checkout

Run the complete local development experience from a trusted checkout:

```bash
git clone https://github.com/gpfeff/negroni.git
cd negroni
npm run setup
npm run dev:local
```

Open `http://127.0.0.1:3000` on the same machine. `npm run dev:local` starts
the loopback web app and its private credential bridge together. Keep the
command running while using Negroni.

Use `npm run dev` only for UI-focused contributor development when the local
credential bridge is intentionally not needed.

### Installable local runtime

Build the package from the application directory, install it, then start it:

```bash
cd negroni/app
package_dir="$(mktemp -d)"
npm pack --pack-destination "$package_dir"
npm install --global "$package_dir"/negroni-local-*.tgz
negroni doctor
negroni start
```

Open `http://127.0.0.1:3000` in a browser on the same machine. Keep
`negroni start` running while using the app.

`negroni doctor` reports the readiness of supported local sign-ins. A missing
or signed-out provider is a configuration finding; it does not authorize a
credential workaround or a browser-stored secret.

## 2. Run on a private remote host, browse from another computer

Use this mode when Negroni should run on a trusted Mac mini or another private
host while you work from a laptop. The app remains on the host's loopback
interface; the client gets a second loopback address through SSH. Screen
Sharing is optional for host maintenance, but it is not required to use the
Negroni browser interface.

### Start Negroni on the host

Install the local runtime on the host using the steps above, then run:

```bash
negroni doctor
negroni start
```

By default, the app listens on `127.0.0.1:3000` and its credential bridge
listens on `127.0.0.1:47831` on the **host**.

### Create a private client tunnel

From the client (for example, a MacBook), connect to the host through a
private Tailscale name or another private SSH route:

```bash
ssh -N \
  -o ControlMaster=no \
  -o ControlPath=none \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:13000:127.0.0.1:3000 \
  <host-user>@<host.tailnet.ts.net>
```

Then open `http://127.0.0.1:13000` in the client browser. Here,
`127.0.0.1:13000` belongs to the **client** and forwards privately to
`127.0.0.1:3000` on the host. Port `13000` avoids a collision with a local
Negroni instance; use client port `3000` only when it is free.

For a persistent tunnel, use the client operating system's user-session service
manager with the same local-only `-L` rule. Verify a one-shot tunnel first, and
never put a password or private key in that service definition.

### Required privacy boundary

Forward only the Negroni app port (`3000`). Do **not** forward the credential
bridge (`47831`), bind either service to `0.0.0.0`, use SSH `-R` or `-g`, add a
Tailscale Serve or Funnel endpoint, configure router port forwarding, or use a
public tunnel or hosting service. The host-side app talks to its credential
bridge through host loopback, so the client never needs bridge access.

The current launcher is a local development runtime, not a production process
manager. If the host restarts or the `negroni start` process exits, start it
again before reconnecting the client tunnel.
