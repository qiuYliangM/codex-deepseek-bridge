# Changelog

## 0.5.2 (plugin-only branch)

- Fix ownership recovery, cross-process registration locking, lifecycle rollback and concurrent MCP session disposal.
- Add ownership-aware offline cleanup for stale registrations and scoped credential artifacts, including manual-mode leases.
- Reject invalid/late/duplicate question answers, propagate deadlines and clean pending question files.
- Preserve created session IDs on index failures; avoid implicit DSH session creation while sending.
- Use accepted/unconfirmed receipts for queued messages.
- Publish the standard bundle as the independent DSH Codex Bridge project.

## 0.5.1 (plugin-only branch)

- Document and verify the persistent-directory install workaround for Desktop 0.31.7, whose startup cleanup removes local tarball dependencies.
- Read native Codex `_meta.threadId` on every MCP tool call to identify the issuing chat automatically, including shared HTTP connections.
- Bind DSH calls to their executing Agent session and reject conflicting manual source IDs before sending. Preserve explicit attribution fallback for clients without host context.
- Cover per-call isolation, invalid metadata, conflict rejection, and two real isolated Codex threads without model prompts.

## 0.5.0 (plugin-only branch)

- Distribute a standard DSH bundle with its own manifest and patch, visible and controllable in the official Plugins page.
- Host authenticated HTTP MCP inside DSH and automatically register its Codex connection through the versioned configuration RPC. No separate runtime installation or manual gateway-token copy is needed.
- Preserve unrelated configuration and comments, reject foreign connections and competing profiles, and retain user changes to an owned transport.
- Cancel requests and release routes, tools and owned MCP registration on disposal; recover the same profile after restart and migrate the old installer's marked patch and stdio connection.
- Keep the standalone CLI as a compatibility entry; validate the shipped bundle and actual DSH/Codex integration with isolated homes and no model prompts.

## 0.4.5

- Add Linux amd64/arm64 Debian packages, a Windows x64 NSIS installer, and macOS Intel/Apple Silicon packages with a bundled, checksum-verified Node.js runtime.
- Build, install, upgrade, and validate all five packages on their native OS and architecture through GitHub Actions.
- Resolve Windows npm CLI shims directly to JavaScript entries without passing message text through a command shell.
- Preserve the `peerbridge` command, MCP registration, plugin identifier, and user data paths across installer updates.

## 0.4.4

- Prepare the public source repository and an installable npm tarball with an explicit file allowlist, MIT license, and CI/release workflows.
- Ship JavaScript runtime entries so installation under `node_modules` does not depend on unsupported TypeScript stripping there.
- Fix installation from paths containing spaces and update an existing MCP registration after moving the install directory.
- Restrict gateway credentials/configuration file permissions and reject invalid gateway URLs before saving them.
- Fail clearly on malformed configuration rather than silently overwriting it.
- Distinguish backend project renaming from the desktop's actual title; incomplete synchronization is reported explicitly.
- Remove inactive Hub entry points and obsolete model-prompting verification programs from the current distribution.

## 0.4.3

- Register new local Codex desktop projects through the existing desktop deep link and verify the resulting backend identity.
- Keep project/session routing explicit and return incomplete receipts for backend-only project registration.

## Known limits

- Existing backend-only projects are not automatically merged into the desktop catalog.
- The desktop creation entry uses the directory name. Arbitrary desktop titles and workspace deletion are not supported by the bridge.
- The runtime verifies persisted desktop registration, not screen contents.
- Cross-host transport, durable question recovery, and automatic conversational loop prevention are not implemented.
