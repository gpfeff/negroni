# Local tools

## Synced artifact routing audit

`artifact-routing-audit.mjs` protects the boundary between:

- synced durable artifacts: `/Users/greg-mac-mini/Documents/tools-negroni`
- authoritative source: `/Users/greg-mac-mini/Developer/negroni`
- private machine-local runtime state: `/Users/greg-mac-mini/.local/share/negroni`

Run a read-only audit first:

```sh
node tools/artifact-routing-audit.mjs
```

It prints proposed decisions and writes nothing. Run `--apply` only after
reviewing that output. It moves unambiguous non-sensitive code with an
exclusive destination create, preserves a differing-destination conflict in a
timestamped `quarantine/routing-conflicts/` folder, and writes a provenance
receipt under the synced workspace's `receipts/` directory. Suspected secrets,
private/runtime data, duplicates, symlinks, in-use files, and unknown files are
never moved automatically and make the command exit nonzero.

For isolated verification, override all three roots:

```sh
node tools/artifact-routing-audit.mjs --source /tmp/artifacts --repository /tmp/repository --runtime /tmp/runtime
```
