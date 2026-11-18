# Legacy native installers (0.4.5)

Version 0.5 uses a standard DSH plugin as its primary installation. These native
installers remain compatibility tooling; they are not needed for plugin-only
installation. See the main README and the bundle README.

Codex DeepSeek Bridge is a CLI and MCP bridge. These installers include Node.js
and the bridge's JavaScript dependencies. They do not include a separate desktop
chat window, Codex, or DeepSeek Harness. Install the two clients separately.

| File suffix | System | Installation location |
| --- | --- | --- |
| `_amd64.deb` | Linux x64, Debian/Ubuntu | `/opt/codex-deepseek-bridge` |
| `_arm64.deb` | Linux ARM64, Debian/Ubuntu | `/opt/codex-deepseek-bridge` |
| `_win-x64.exe` | Windows x64 | `%LOCALAPPDATA%\Programs\CodexDeepSeekBridge` |
| `_darwin-x64.pkg` | macOS Intel | `/usr/local/lib/codex-deepseek-bridge` |
| `_darwin-arm64.pkg` | macOS Apple Silicon | `/usr/local/lib/codex-deepseek-bridge` |

The ARM package targets ARM64 (aarch64), not 32-bit ARM. Linux packages require
glibc 2.28 or newer plus the dependencies declared in their Debian control file.
Every installer has a matching `.sha256` file. Node.js archives are checked against
pinned SHA-256 values from the official Node.js distribution before packaging;
Node.js and third-party licenses are included.

## Install and connect the clients

Linux: `sudo apt install ./codex-deepseek-bridge_*_amd64.deb` (or the ARM64 file).
macOS: open the matching `.pkg` and follow the system installer. Windows: run the
`.exe`; administrator access is not required. Its Start menu shortcut opens a
terminal with the bundled commands available. In other Windows terminals use
the full path to `peerbridge.cmd`, or add the installation directory to your own
PATH. Unix installers provide `peerbridge` in `/usr/bin` or `/usr/local/bin`.

After installing, **as your normal user**, run:

```sh
peerbridge install
peerbridge status
```

Run these commands in the account that owns the client profiles. Installing the
OS package does not register plugins as root or change an administrator's client
configuration. `peerbridge install` registers the DSH plugin and Codex MCP, using
the bundled Node.js for MCP. Restart the corresponding clients to load it. DSH's
own plugin manager may require its normal network access.

The clients' CLI commands must be available on PATH. Alternatively, set absolute
`codexBin` and `dshBin` paths in `~/.peerbridge/config.json` (on Windows this is
`%USERPROFILE%\.peerbridge\config.json`). Native executables and JavaScript
entries are supported; ordinary npm-generated `.cmd` shims are resolved to their
JavaScript entries without passing message text through a shell. Custom batch
scripts must be replaced with a real `.exe` or `.js`/`.mjs` entry.

Update the token URL with `peerbridge weburl '<token URL>'` as described in the
main README. Keep the token and local configuration out of the repository.

## Updates and removal

Install a newer package over the existing one; the OS package identity and default
installation path remain stable. Local data is kept in `~/.peerbridge` and client
profiles, outside the installation directory. Existing source/npm installations
should run `peerbridge install` again from the new native installation so MCP
uses its bundled runtime and path.

Before removing the OS package, run `peerbridge uninstall` as your normal user
to unregister the integration. Then remove the Debian package, use Windows Apps
or its uninstaller, or remove the macOS installation files. On macOS the files
are `/usr/local/lib/codex-deepseek-bridge`, `/usr/local/bin/peerbridge`, and
`/usr/local/bin/peerbridge-codex-mcp`; the package receipt identifier is
`io.github.qiuYliangM.codex-deepseek-bridge`. User data remains unless explicitly
archived with `peerbridge uninstall --purge`.

## Validation and compatibility

The native build workflow installs each generated package on its corresponding
OS and architecture, then checks the bundled runtime, CLI, MCP initialization,
all 12 tool definitions, and plugin/MCP registration in isolated test profiles.
These checks do not call real models. They do not prove compatibility with every
client version. Full desktop synchronization has been tested on Linux ARM64;
automatic desktop discovery on Windows/macOS is not implemented. Backend
registration on those platforms reports its desktop synchronization limits.

The Windows installer is not Authenticode signed. macOS packages are not Developer
ID signed or notarized; the OS may require approval for a downloaded
installer. No signing certificates are bundled or purchased by this build.

## Rebuild

Use a native build host for the installer type. NSIS is needed on Windows;
`dpkg-deb` is needed on Linux; `pkgbuild` is supplied by macOS.

```sh
npm ci
npm test
npm run package:legacy
npm run test:package:legacy
npm run package:installer -- linux-arm64
```

Other targets: `linux-x64`, `win-x64`, `darwin-x64`, `darwin-arm64`. Output goes to
`dist/`. On GitHub, run the **Native installers** workflow manually to build all
five targets with standard hosted runners. Download its installer artifacts;
each contains the installer, checksum, and native validation report.
The 0.5 release workflow publishes the standard plugin tarball. Native installer
builds are a separate manual compatibility workflow.
