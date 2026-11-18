# Codex DeepSeek Bridge

Codex × DeepSeek Harness 的本机协作桥。v0.4 使用显式工程和会话参数管理消息目标，无需常驻 Hub。使用 MIT 许可证，不捆绑两个客户端。

命令、npm 包名和本机配置目录继续使用 `peerbridge`，兼容已有安装。

当前主要实测平台为 Linux ARM64；其他系统尚未完成桌面端兼容验证。工程删除、旧后台工程自动合并和任意桌面标题同步尚未支持。

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

`sourceSession` 是发送和提问的可选来源标签，不决定目标。Codex 默认从 `CODEX_THREAD_ID` / `CODEX_SESSION_ID` 获取来源，DSH 默认使用执行工具的 Agent 会话 ID。来源缺失不影响显式目标发送。

## 安装

Linux x64/ARM64 `.deb`、Windows x64 `.exe`、macOS Intel/Apple Silicon `.pkg` 安装包内置 Node.js；安装、连接客户端与升级方式见 [安装包说明](docs/installers.md)。项目提供命令行与 MCP 工具。

需要 Node.js >= 22.19、已安装且支持 `codex queue` 和实验性项目 RPC 的 Codex CLI，以及可用的 DSH CLI/Web 网关。同一系统用户运行两个客户端；这不是跨主机服务。没有对应实验性接口的 Codex 版本会报错。

从源码安装：

```bash
npm ci
node bin/peerbridge.mjs install
node bin/peerbridge.mjs status
```

安装器更新 SDK、Web 以及已存在的 `tauri`、`desktop` profile；新版官方桌面版使用 `desktop`。尊重 `DSH_HOME` 和 `CODEX_HOME`。未指定 DSH CLI 时优先使用 `~/.local/bin/dsh`，再回退到源码 CLI。更新后重启对应 DSH 宿主和 Codex MCP，加载新版工具。

WebSocket 依赖 `ws` 8.23.0 及 MIT 许可证随插件提供。桥本身无需下载运行时依赖；DSH CLI/profile 尚未就绪时，其自身的安装过程仍可能联网。安装器使用按内容哈希命名的本地源码快照，避免 pnpm 的旧 `file:` 硬链接副本遗漏新增文件。

```bash
node bin/peerbridge.mjs weburl '<带token的地址>'
node bin/peerbridge.mjs uninstall
```

默认读取 `~/.peerbridge/web-url.txt`。从 DSH 启动日志复制其本机带 token 地址并运行 `weburl` 命令；宿主重启后地址/token 可能变化，需要更新。地址文件包含登录凭据，不要提交到 GitHub。支持 HTTP(S) 回环地址，并在写入前校验 token。连接桌面版时应写入其实际地址；安装插件不会自动切换网关。

也可以安装构建后的 tarball（不包含 Node.js 或客户端）：

```bash
npm run package
npm run test:package
npm install --global ./dist/peerbridge-0.4.5.tgz
peerbridge install
```

`dist/SHA256SUMS` 包含校验值。仓库的 CI 使用标准 GitHub-hosted Ubuntu runner 运行测试和打包；推送与 `package.json` 版本一致的 `v*` 标签后，Release 工作流会发布 tarball 和校验文件。不会自动发布到 npm，也不配置付费大型 runner。费用以 [GitHub Actions 官方说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions) 为准。

## 命令行

```bash
node bin/peerbridge.mjs peer dsh workspaces
node bin/peerbridge.mjs peer dsh create-workspace '{"path":"/absolute/path/example","createDirectory":true,"title":"Example"}'
node bin/peerbridge.mjs peer dsh sessions '{"workspace":"返回的workspaceId"}'
node bin/peerbridge.mjs peer dsh create-session '{"workspace":"返回的workspaceId","title":"开发任务"}'
node bin/peerbridge.mjs peer dsh send '{"workspace":"返回的workspaceId","session":"返回的sessionId","text":"请检查当前工程"}'
```

将 `dsh` 改成 `codex` 可管理 Codex。其余操作：`status`、`rename-workspace`、`rename-session`、`archive-session`、`ask`。

## 实现与边界

- Codex → DSH：HTTP 网关执行工程和会话操作，WebSocket `workspace/follow` 获取注册表快照，`session/prompt` 入队。
- DSH → Codex：按需运行 `codex app-server --listen stdio://`，调用 `project/*`、`thread/*`；消息使用 `codex queue`。配置 `codexSocket` 可改用已运行 daemon 的 `app-server proxy`。
- Codex 项目管理依赖本机实验性 app-server 协议；旧版本缺少接口会返回错误。
- Codex 默认列表隐藏新建空会话。桥保留自己创建的会话 ID，并通过 `thread/read` 验证和补全列表；归档以服务器列表为准。这个索引用于列出会话，不是默认发送目标。GUI 是否显示空会话由客户端决定。
- DSH 网关仅支持本机回环地址。目录创建、回答文件共享和两个客户端须处于同一用户文件系统中。
- 创建与改名分步执行；若创建后改名失败，错误包含已创建对象 ID，避免重复创建。
- 问答仍依赖当前进程等待和本地回答文件；进程重启后的任务恢复、跨主机传输、自动循环对话终止策略尚未实现。避免双方同时阻塞等待对方回答。
- `peer_send` 的 DSH `requestId` 可由调用者提供以重试同一逻辑消息；Codex queue 暂无对应去重保证。回执仅表示排队。
- `~/.peerbridge/`（或 `PEERBRIDGE_HOME`）保存配置、安装快照、已创建 Codex 会话索引、时间线和回答文件，均为本机明文文件。
- 本版仅发布当前共享运行时、CLI 和 MCP；不包含旧 Hub 服务或调用真实模型的旧验收程序。

## 验证

```bash
npm test
PEERBRIDGE_TEST_CODEX_BIN=/absolute/path/to/codex \
PEERBRIDGE_TEST_DSH_BIN=/absolute/path/to/dsh/lib/bin.js \
npm test
```

默认测试使用独立目录、模拟网关和假 Codex 可执行文件。设置上述变量会额外在临时 `CODEX_HOME` / `DSH_HOME` 中验证真实接口的创建、重命名、归档和恢复，不发送模型消息，不修改日常会话。

可选 DSH 实测参数必须指向可由 Node 直接执行的 CLI JavaScript 入口，不是桌面版生成的 shell shim。CI 不运行可选真实客户端测试。打包后的独立安装和 12 个 MCP 工具可用 `npm run test:package` 检查，测试过程不会连接个人客户端。

核心运行时代码在 `bridges/dsh/peerbridge-dsh-plugin/src/`，由 DSH 插件、Codex MCP 和 CLI 共用。

贡献与安全边界见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)。第三方 `ws` 的许可证随源码和安装包保留。
