# Sol Ultra continuation prompt: private thin-client setup

Paste the following into 5.6 Ultra while it is running on the Mac Mini.

```text
Fully complete the private thin-client setup for Negroni. You are authorized to make the necessary local configuration changes on this Mac Mini and, if you have access, on my MacBook Pro.

Goal: from my MacBook Pro, privately connect to this Mac Mini over Tailscale using Screen Sharing or Jump Desktop; then use Negroni inside the remote Mac Mini desktop at http://127.0.0.1:3000.

Authorized changes:
- Configure and verify macOS Screen Sharing for the account Greg-12P.
- Configure a saved private Tailscale-based Screen Sharing/Jump Desktop connection on the MacBook if that machine is accessible.
- Start or repair the local Negroni service if necessary.
- Adjust only the settings required for this private remote-desktop workflow.
- Validate the complete MacBook-to-Mini connection and open Negroni in the Mini’s browser.

Required boundaries:
- Keep Negroni at 127.0.0.1:3000 and its credential bridge at 127.0.0.1:47831.
- Do not expose Negroni, VNC, credentials, or the credential bridge publicly.
- Do not use Cloudflare Tunnel, Tailscale Funnel, port forwarding, or public hosting.
- Do not alter or overwrite the existing unrelated Tailscale Serve routes on HTTPS 443 and 8443.
- Do not copy, sync, print, or store credentials in the browser or source tree.
- Preserve existing user access and system configuration unless changing it is required for this exact goal.

Known state:
- Both Macs are connected to Tailscale.
- This Mini is mac-mini.tail2be146.ts.net.
- Negroni should be available locally at http://127.0.0.1:3000.
- Screen Sharing has been enabled previously, with Greg-12P as the permitted user.
- Jump Desktop is installed but may not have a saved computer entry.

Do the work now. Only stop if macOS requires my password, physical presence, an account login, or an action outside these boundaries. At the end, give a concise receipt: changes made, proof the connection works, the saved connection name/URL, and any remaining manual step.
```
