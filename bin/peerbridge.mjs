#!/usr/bin/env node
// PeerBridge CLI（无 Hub 架构）：install / uninstall / weburl / status / peer
const [, , command, ...rest] = process.argv
const standalone = await import('../src/standalone.js')

switch (command) {
  case 'install':
    if (rest.length && (rest[0] !== '--profile' || !rest[1] || rest.length !== 2)) throw new Error('用法：peerbridge install [--profile desktop]')
    standalone.cmdInstall(rest[1]); break
  case 'uninstall':
    standalone.cmdUninstall(rest.includes('--purge')); break
  case 'bind':
    console.error('bind 已停用：发送和提问必须显式传入 workspace 与 session。'); process.exitCode = 1; break
  case 'weburl':
    if (rest[0] === undefined) { console.error('用法：peerbridge weburl <带 token 的 dsh web 地址>'); process.exit(1) }
    standalone.cmdWebUrl(rest[0]); break
  case 'status':
    standalone.cmdStatus(); break
  case 'peer': {
    const [peer, action, raw = '{}'] = rest
    const { runTool } = await import('../bridges/dsh/peerbridge-dsh-plugin/src/tools.js')
    const operations = {
      status: 'peer_status', workspaces: 'peer_workspaces', 'create-workspace': 'peer_create_workspace',
      'rename-workspace': 'peer_rename_workspace',
      sessions: 'peer_sessions', 'create-session': 'peer_create_session',
      'rename-session': 'peer_rename_session', 'archive-session': 'peer_archive_session',
      send: 'peer_send', ask: 'peer_ask',
    }
    try {
      if (!['dsh', 'codex'].includes(peer) || !operations[action]) throw new Error('用法：peerbridge peer <dsh|codex> <操作> [JSON参数]')
      const args = JSON.parse(raw)
      if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('参数必须是 JSON 对象')
      const result = await runTool(peer, operations[action], args, { sourceSession: 'cli' })
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      console.error(JSON.stringify({ error: { code: error.code || 'PEER_ERROR', message: error.message, details: error.details, nextTools: error.nextTools } }, null, 2))
      process.exitCode = 1
    }
    break
  }
  default:
    console.log('Codex DeepSeek Bridge —— Codex × DeepSeek Harness 对等协作桥（无守护进程）\n')
    console.log('  peerbridge install [--profile 名称]  安装标准 DSH bundle（插件自动配置 Codex）')
    console.log('  peerbridge weburl <带token地址>   写入 dsh 网关地址（宿主重启后可能需要更新）')
    console.log('  peerbridge status                 查看状态')
    console.log('  peerbridge peer <dsh|codex> <操作> [JSON参数]   显式指定工程与会话')
    console.log('  peerbridge uninstall [--purge]    卸载（--purge 一并归档数据目录）')
}
