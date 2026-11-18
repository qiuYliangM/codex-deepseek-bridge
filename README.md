# Codex DeepSeek Bridge

在 **DSH 侧安装一次标准插件**，为 Codex 与 DeepSeek Harness 提供双向消息、工程与会话管理。插件直接运行在 DSH 宿主中，自动注册 Codex 的本机 HTTP MCP 连接；不需要安装第二个应用、全局 Node.js、常驻 Hub 或手工复制网关 token。

独立插件项目现位于 [DSH Codex Bridge](https://github.com/qiuYliangM/dsh-codex-bridge)，提供根目录标准 bundle、离线清理命令和独立发布。本分支保留兼容 CLI 与审核修复。

本分支开发版本为 **0.5.2**。主线已发布的 0.4.5 原生安装包保留原有行为。新插件使用 MIT 许可证，不包含两个客户端、账户信息或密钥。

需要已安装的两个客户端和可用的 Codex CLI。首次启用后需重载 Codex；DSH 未启用热重载时也需要重启。插件安装不发送模型消息。当前真实客户端实测为 Linux ARM64；其他平台通过隔离协议和生命周期测试，不代表已验证所有桌面版本。

## 目标参数

已知目标时，直接调用：

```json
{
  "workspace": "对方工具返回的 workspaceId，或精确绝对路径",
  "session": "该工程下的 sessionId",
  "text": "消息内容"
}
```

`peer_send` 和 `peer_ask` 必须同时指定 `workspace`、`session`。桥在发送前校验工程存在、会话存在且未归档，以及会话确实属于指定工程。缺少参数、不存在、路径歧义或工程与会话不匹配时直接报错，不选默认目标，不自动新建。

调用方拿到错误后自行决定下一步：用 `peer_workspaces` 查询或 `peer_create_workspace` 新建工程；用 `peer_sessions({workspace})` 查询或 `peer_create_session({workspace})` 新建会话。创建操作只返回 ID，后续调用继续显式传入目标，不发送开场消息。

MCP 和 CLI 的目标错误包含 `code`、`message`、`details` 和 `nextTools`，例如：

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "会话不存在或已归档，请调用 peer_sessions 查询，或 peer_create_session 新建",
    "details": {"workspaceId": "...", "sessionId": "...", "archived": false},
    "nextTools": ["peer_sessions", "peer_create_session"]
  }
}
```

旧的 `peer_select_workspace`、`peer_select_session`、`peer_clear_selection` 和 `bind` 已停用；旧选择文件和配置中的 `codexThread` 不再参与路由。历史数据保留，不自动删除。

## 工具

两端提供相同的 12 个工具，`peer` 始终代表对方客户端。这些工具不是任意桌面操作接口：

| 工具 | 必需目标参数 | 操作 |
| --- | --- | --- |
| `peer_status` | 无 | 查看连接和能力 |
| `peer_workspaces` | 无 | 列出真实注册的工程，包括空工程 |
| `peer_create_workspace` | `path` | 登记本机目录；目录不存在时须显式指定 `createDirectory: true` |
| `peer_rename_workspace` | `workspace` | 修改后台工程名，保留目录路径；Codex 桌面名称未同步时返回未完成 |
| `peer_sessions` | `workspace` | 列出工程会话；`archived: true` 查看归档 |
| `peer_create_session` | `workspace` | 创建空会话，返回其 ID |
| `peer_rename_session` | `workspace`、`session` | 修改会话名称 |
| `peer_archive_session` | `workspace`、`session` | `archived: true/false` 归档或恢复，保留历史和文件 |
| `peer_send` | `workspace`、`session` | 消息入队，回执不代表任务已完成 |
| `peer_ask` | `workspace`、`session` | 提问并等待，支持取消和超时 |
| `peer_answer` | `questionId` | 回答问题，按问题 ID 关联 |
| `peer_events` | 无 | 查看共享时间线，最多 200 条 |

创建已注册目录返回原工程，不重复创建，也不覆盖现有名称。不会克隆仓库、生成项目代码或删除目录。Codex 本机桌面版的新建操作会通过工程入口打开目录，因此会选中该工程并显示空白输入页，但不创建会话、不发送消息。

Codex 本机桌面同步：检测到本机桌面版后，新目录通过 `codex://new?path=…` 入口登记，等待桌面持久化记录中的工程 ID，再通过后台 `project/read` 核对目录。不会先另建一个后台工程，从而避免重复。当前 Linux 安装路径自动识别；其他安装路径可在 `~/.peerbridge/config.json` 指定 `codexDesktopBin`，设为 `false` 则仅使用后台接口。独立 `CODEX_HOME` 或远程 `codexSocket` 不自动启动本机桌面。目录信任需要用户在客户端处理；超时后应先查询已有结果。

`desktopSync` 分别报告 `registered`（桌面状态中已登记）、`missing`、`identity-mismatch` 或 `unavailable`，并通过 `displayTitle`、`titleMatches` 区分后台名称与桌面名称。`liveUiVerified: false` 表示运行时仅核对持久化登记，没有读取屏幕。桌面入口使用目录名；请求不同的自定义标题会返回 `titleApplied: false`、`completed: false`，不能报告完整成功。已有的仅后台登记工程不会自动合并或重复新建，会保留原 ID 并返回 `completed: false`；未检测到桌面入口时也明确返回后台部分成功。修改后台工程名暂不保证同步桌面名称。读取桌面状态不修改客户端文件、不自动重启客户端。DeepSeek 官方桌面版的创建结果已验证进入其工作区注册表。

Codex 的原生 MCP 调用通过每次请求的 `_meta.threadId` 自动提供来源会话；DSH 使用执行工具的 Agent 会话 ID。宿主提供来源时，手工 `sourceSession` 与其冲突会报 `SOURCE_SESSION_MISMATCH`，不会发送。旧 stdio 入口保留环境变量回退；缺少宿主上下文的兼容调用仍可显式提供来源标签。MCP 的连接会话 ID 不用于识别 Codex 聊天，来源缺失时也不猜测默认聊天。来源字段不决定发送目标。

这只补齐自动来源识别；结构化收件箱和 `peer_reply` 尚未实现，当前消息来源仍显示在正文标签中。原生元数据是宿主提供的调用上下文，不构成跨用户身份认证。

## 安装

下载或构建 `peerbridge-dsh-plugin-0.5.2.tgz`。当前 DSH Desktop 0.31.7 的启动清理会把本地 `.tgz` 文件误判为失效目录依赖；桌面版请先解压到长期保留的目录，再安装这个标准插件目录。POSIX 示例：

```sh
mkdir -p ~/.local/share/codex-deepseek-bridge/0.5.2
tar -xzf /absolute/path/peerbridge-dsh-plugin-0.5.2.tgz --strip-components=1 -C ~/.local/share/codex-deepseek-bridge/0.5.2
dsh plugin --profile desktop add ~/.local/share/codex-deepseek-bridge/0.5.2
```

也可在 DSH 插件页添加解压后含 `package.json` 的目录绝对路径。保持该目录存在，升级使用新的版本目录。DSH Web 可以直接 `dsh plugin --profile web add /absolute/path/peerbridge-dsh-plugin-0.5.2.tgz`。不要直接安装仓库根目录的 GitHub 源码压缩包：可安装的标准插件位于 `bridges/dsh/peerbridge-dsh-plugin`，根项目仍保留兼容 CLI 开发代码。

DSH 插件页负责启停、更新、卸载。插件启用时自动检测 Codex 并通过其 `config/read`、`config/batchWrite` 接口登记 MCP；只修改自己拥有的配置项，保留其他 MCP、用户配置和 TOML 注释。插件停用时撤销路由和工具、取消未完成调用，并清理自己创建的 MCP 接入口。升级时安装新版 tarball，按 DSH 提示重启。Codex 已加载的会话可能需要重载工具。

在多个 DSH profile 安装时，为每个 profile 设置不同的 `mcpServerName`；插件拒绝覆盖已有的其他连接。可设置 `codexBin`、`codexHome`，或通过 `autoConfigureCodex: false` 关闭自动配置。当前需要提供 Web 服务的 profile，不能在缺少 Web 服务的 headless/SDK profile 中提供双向 MCP。

旧安装器的标记 patch 会自动迁移；首次切换可能需要重启 DSH 卸载旧模块，并重载 Codex 结束旧 stdio 接入。宿主未运行时卸载包、强制结束进程或 Codex 配置不可访问时，无法保证执行清理；失效端点不能执行调用，可从 Codex MCP 设置删除遗留项。

配置、所有权、迁移与限制详见 [插件文档](bridges/dsh/peerbridge-dsh-plugin/README.md)。0.4.5 系统安装包的说明见 [历史安装包文档](docs/installers.md)。

从源码构建：

```sh
npm ci
npm test
npm run package
npm run test:package
```

产物与 SHA-256 校验值位于 `dist/`。插件自带 `ws` 及其 MIT 许可证；DSH 的包管理器仍可能需要正常的依赖安装网络访问。安装的宿主代码具有当前用户权限，两个客户端自己的授权、目录信任和管理员策略仍生效。

## 命令行

以下兼容 CLI 用于开发和诊断，不是标准插件安装的必需步骤。旧 CLI 的 `install` 现在仅向一个 profile 安装标准 bundle，Codex 注册由运行中的插件负责。

```bash
node bin/peerbridge.mjs peer dsh workspaces
node bin/peerbridge.mjs peer dsh create-workspace '{"path":"/absolute/path/example","createDirectory":true,"title":"Example"}'
node bin/peerbridge.mjs peer dsh sessions '{"workspace":"返回的workspaceId"}'
node bin/peerbridge.mjs peer dsh create-session '{"workspace":"返回的workspaceId","title":"开发任务"}'
node bin/peerbridge.mjs peer dsh send '{"workspace":"返回的workspaceId","session":"返回的sessionId","text":"请检查当前工程"}'
```

将 `dsh` 改成 `codex` 可管理 Codex。其余操作：`status`、`rename-workspace`、`rename-session`、`archive-session`、`ask`。

## 实现与边界

- Codex → DSH：调用插件内的鉴权 HTTP MCP；插件使用宿主当前网关凭据执行工程和会话操作，WebSocket `workspace/follow` 获取注册表快照，`session/prompt` 入队。
- DSH → Codex：按需运行 `codex app-server --listen stdio://`，调用 `project/*`、`thread/*`；消息使用 `codex queue`。配置 `codexSocket` 可改用已运行 daemon 的 `app-server proxy`。
- Codex 项目管理依赖本机实验性 app-server 协议；旧版本缺少接口会返回错误。
- Codex 默认列表隐藏新建空会话。桥保留自己创建的会话 ID，并通过 `thread/read` 验证和补全列表；归档以服务器列表为准。这个索引用于列出会话，不是默认发送目标。GUI 是否显示空会话由客户端决定。
- DSH 网关仅支持本机回环地址。目录创建、回答文件共享和两个客户端须处于同一用户文件系统中。
- 创建与改名分步执行；若创建后改名失败，错误包含已创建对象 ID，避免重复创建。
- 问答依赖当前进程等待和本地短期问题状态，成功/失败/取消/超时清理；进程重启后的任务恢复、跨主机传输、自动循环对话终止策略尚未实现。避免双方同时阻塞等待对方回答。
- `peer_send` 的 DSH `requestId` 可由调用者提供以重试同一逻辑消息；Codex queue 暂无对应去重保证。回执仅表示排队。
- `~/.peerbridge/`（或 `PEERBRIDGE_HOME`）保存配置、安装快照、已创建 Codex 会话索引、时间线和短期问题状态，均为本机明文文件。
- 主分发为标准 DSH bundle。兼容 CLI 和旧版系统打包脚本仅作迁移/诊断入口，不包含旧 Hub 服务。

## 验证

```bash
npm test
PEERBRIDGE_TEST_CODEX_BIN=/absolute/path/to/codex \
PEERBRIDGE_TEST_DSH_BIN=/absolute/path/to/dsh/lib/bin.js \
npm test
```

默认测试使用独立目录、模拟网关和假 Codex 可执行文件，并验证 HTTP MCP 鉴权、取消、注册所有权、启停及迁移。设置上述变量会额外在临时 `CODEX_HOME` / `DSH_HOME` 中验证真实接口的创建、重命名、归档和恢复，不发送模型消息，不修改日常会话。

可选 DSH 实测参数必须指向可由 Node 直接执行的 CLI JavaScript 入口，不是桌面版生成的 shell shim。CI 不运行可选真实客户端测试。标准插件包的离线安装、声明及 12 个 MCP 工具可用 `npm run test:package` 检查，测试过程不会连接个人客户端。

核心运行时代码在 `bridges/dsh/peerbridge-dsh-plugin/src/`，由 DSH 插件、Codex MCP 和 CLI 共用。

贡献与安全边界见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)。第三方 `ws` 的许可证随源码和安装包保留。

本机真实客户端的完整插件验收（隔离 DSH/Codex home，不发送模型消息）：

```sh
PEERBRIDGE_TEST_DSH_SHIM=/absolute/path/to/dsh \
PEERBRIDGE_TEST_CODEX_BIN=/absolute/path/to/codex \
node verify/live-dsh-plugin.mjs
```

该验收验证官方插件管理列表、Codex 原生 MCP 工具发现、网关调用、停用清理、重启恢复、重复安装和卸载。桌面生成的启动器若固定 `DSH_HOME`，脚本只在私有测试副本中移除该固定值，并在安装前核验隔离目录；不修改用户启动器。

POSIX 测试环境可额外指定 `PEERBRIDGE_TEST_PNPM_BIN=/absolute/path/to/native/pnpm`，复用已安装的包管理器，避免 Corepack 在每个隔离 home 中重新下载；此选项只修改测试进程的 PATH。
