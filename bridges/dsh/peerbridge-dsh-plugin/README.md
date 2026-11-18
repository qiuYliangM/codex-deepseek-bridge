# Codex DeepSeek Bridge

A standard DeepSeek Harness bundle. Install once in the DSH desktop or Web
profile; the plugin provides bidirectional tools and automatically registers
its local authenticated HTTP MCP connection with Codex. It runs inside DSH,
uses DSH's runtime and gateway credentials, and needs no standalone application,
global Node.js installation, daemon, or manually copied gateway token.

On Desktop 0.31.7, startup cleanup mistakes local tarball dependencies for
missing directories. Extract this bundle into a permanent directory and install
that directory through the Plugins page or CLI. POSIX example:

```sh
mkdir -p ~/.local/share/codex-deepseek-bridge/0.5.1
tar -xzf /absolute/path/peerbridge-dsh-plugin-0.5.1.tgz --strip-components=1 -C ~/.local/share/codex-deepseek-bridge/0.5.1
dsh plugin --profile desktop add ~/.local/share/codex-deepseek-bridge/0.5.1
```

Keep this directory; upgrades should use a new version directory. DSH Web can
install the tarball directly with `dsh plugin --profile web add /path/to/bundle.tgz`. Install the actual bundle tarball, not the root
GitHub source archive (the root remains the compatibility CLI development
project). The bundle must run in a profile providing `tools`, `webServer`,
`connection`, `profileContext`, and `loader`; a headless/SDK profile without a
Web server cannot provide this bidirectional MCP endpoint.

Restart DSH when its profile does not apply changes live. On first connection,
reload Codex so it discovers the MCP tools. Both clients and their usable Codex
CLI must already be installed under the same OS account. No model messages are
sent during installation or registration. Existing chats/projects are kept.

The DSH Plugins page lists this package as a bundle and owns enable/disable,
upgrade and removal. Disabling cancels pending bridge calls, unregisters its
route and tools, and removes its own Codex MCP entry. Enabling registers them
again. An already running Codex chat may retain its tool catalog until reload;
the disabled endpoint cannot execute those calls. Upgrade by installing the new
tarball over this package, then restart the host when DSH requests it.

## Configuration

Configure the `codex-deepseek-bridge` entry using the DSH plugin configuration:

| Field | Default | Purpose |
| --- | --- | --- |
| `autoConfigureCodex` | `true` | Register and clean up the owned Codex MCP connection |
| `mcpServerName` | `peerbridge` | A unique Codex MCP server name; use different names for different profiles |
| `codexBin` | detected embedded binary or `codex` on PATH | Explicit native executable or JavaScript CLI entry |
| `codexHome` | `CODEX_HOME` or `~/.codex` | Codex home whose user configuration and projects are used |

Linux's known embedded binary and common macOS application paths are checked;
other layouts can set `codexBin`. The current endpoint uses DSH's default local
HTTP listener (IPv4 or IPv6 loopback). Network-exposed listeners and TLS are
refused rather than registering an unusable or exposed MCP connection.
With automatic registration disabled, the private registration file contains the
token needed to configure another local MCP client manually.

All send/ask calls require explicit `workspace` and `session`; missing or
mismatched targets fail without choosing or creating replacements. Project and
session management tools preserve the existing bridge's semantics and desktop
synchronization limits.

Codex supplies the source chat automatically in each native MCP call through
`_meta.threadId`; DSH uses the executing Agent session. A conflicting manual
`sourceSession` is rejected before delivery. Source context is never inferred
from a shared MCP session or a previous request. Older/custom clients without
this metadata retain the explicit attribution fallback. This metadata is host
context, not cross-user identity authentication. Structured inbox/reply routing
is not yet implemented; source labels are still rendered in message text.

## Ownership and migration

Only the named MCP entry is changed, through Codex's configuration RPC with a
version check. Unrelated settings and TOML comments are retained. Existing
foreign MCP connections are rejected; they are never silently replaced. A
second live profile using the same server name is rejected. Credential and
ownership records live under `~/.peerbridge/registrations/` with owner-only POSIX
permissions; they are not part of this package. Keep them private.

The old standalone installer's marked profile patch is removed automatically.
Its marked stdio MCP entry can be migrated to this plugin. The first migration
may require a DSH restart to unload the cached old plugin; reload existing Codex
chats to stop using their old stdio tools. User-created profile patches outside
the installer's marker are retained. If a user changes the owned MCP transport,
cleanup preserves that edited connection. If the Codex CLI/configuration becomes
unavailable during removal, cleanup reports failure and retains a recovery record;
remove that MCP entry in Codex or restore the CLI before retrying.

The clients' permission, directory trust, and administrator policies still
apply. The plugin does not patch client programs or grant folder trust.

Cleanup requires a running host to dispose the plugin. Removing its package
while DSH is stopped, or forcibly terminating DSH, cannot run that cleanup. The
closed endpoint cannot execute calls; restarting the same installed profile
recovers its registration. After offline removal, delete the stale connection
from Codex's MCP settings (or `codex mcp remove peerbridge`).

Source, protocol limits, and tests:
https://github.com/qiuYliangM/codex-deepseek-bridge/tree/feat/dsh-single-install

MIT license; vendored `ws` retains its upstream license.
