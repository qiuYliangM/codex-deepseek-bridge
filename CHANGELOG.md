# Changelog

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
