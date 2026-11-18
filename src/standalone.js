/**
 * PeerBridge 独立 CLI（无 Hub 架构）：一次性安装/卸载，无守护进程。
 *
 *   peerbridge install                 安装：DSH 插件入 profile + Codex MCP 注册 + 初始化配置
 *   peerbridge uninstall               卸载：两端注册摘除（配置目录保留，可加 --purge 清理）
 *   peerbridge weburl <带token地址>     写入 dsh Web 网关地址（宿主重启后可能需要更新）
 *   peerbridge status                  查看安装与绑定状态
 *
 * @module peerbridge/standalone
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDir, readConfig as loadConfig } from '../bridges/dsh/peerbridge-dsh-plugin/src/state.js'
import { parseGatewayUrl } from '../bridges/dsh/peerbridge-dsh-plugin/src/dsh-client.js'
import { cliCommand, cliEnvironment } from '../bridges/dsh/peerbridge-dsh-plugin/src/cli-command.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = dataDir()
const CONFIG_PATH = join(DATA_DIR, 'config.json')
const PLUGIN_PATH = join(ROOT, 'bridges', 'dsh', 'peerbridge-dsh-plugin')
const MCP_ENTRY = join(ROOT, 'bin', 'codex-mcp.mjs')

const CODEX_MARKER = '# PeerBridge: peer collaboration bridge (managed by peerbridge CLI; remove via peerbridge uninstall)'
const PATCH_BEGIN = '# begin-peerbridge (managed by peerbridge CLI)'
const PATCH_END = '# end-peerbridge'

function readConfig()             {
  return loadConfig()
}

function writeConfig(config            )       {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, undefined, 2)}\n`, { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
}

function guessCodexBin()         {
  const embedded = '/usr/lib/chatgpt/resources/codex'
  return existsSync(embedded) ? embedded : 'codex'
}

function guessDshBin()         {
  const desktop = join(homedir(), '.local', 'bin', 'dsh')
  if (existsSync(desktop)) return desktop
  const candidate = join(homedir(), 'Desktop', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')
  return existsSync(candidate) ? candidate : 'dsh'
}

function runDsh(dshBin        , args          )       {
  const cli = cliCommand(dshBin, args)
  execFileSync(cli.command, cli.args, { env: cliEnvironment(), encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'] })
}

function pluginSnapshot()         {
  const hash = createHash('sha256')
  const visit = (path        , relative = '')       => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules') continue
      const name = join(relative, entry.name)
      if (entry.isDirectory()) visit(join(path, entry.name), name)
      else if (entry.isFile()) hash.update(name).update('\0').update(readFileSync(join(path, entry.name))).update('\0')
      else throw new Error(`插件快照不支持符号链接: ${name}`)
    }
  }
  visit(PLUGIN_PATH)
  const path = join(DATA_DIR, 'packages', hash.digest('hex'))
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const temporary = `${path}.tmp-${process.pid}`
    cpSync(PLUGIN_PATH, temporary, { recursive: true, filter: source => !relative(PLUGIN_PATH, source).split(sep).includes('node_modules') })
    renameSync(temporary, path)
  }
  return path
}

function dshProfileDir(profile        )         {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', profile)
}

function profiles()           {
  return ['sdk', 'web', ...['tauri', 'desktop'].filter(profile => existsSync(dshProfileDir(profile)))]
}

function codexConfigPath()         {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml')
}

function escapeRegExp(value        )         {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** profile 用户 patch 层：写/删插件激活行（标记块包裹，保证文件始终为有效 YAML）。 */
function upsertPatchRow(profile        , add         )       {
  if (!add && !existsSync(dshProfileDir(profile))) return
  mkdirSync(dshProfileDir(profile), { recursive: true })
  const patchPath = join(dshProfileDir(profile), 'cordis.patch.yml')
  const block = [
    PATCH_BEGIN,
    '- insert:',
    '    - id: peerbridge',
    "      name: 'peerbridge-dsh-plugin'",
    PATCH_END,
  ].join('\n')
  const current = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  let without = current
  if (current.includes(PATCH_BEGIN) && current.includes(PATCH_END)) {
    without = current.replace(new RegExp(`${escapeRegExp(PATCH_BEGIN)}[\\s\\S]*?${escapeRegExp(PATCH_END)}\\n?`, 'g'), '')
  }
  if (!add) {
    const hasNode = without.split('\n').some(line => { const t = line.trim(); return t.length > 0 && !t.startsWith('#') })
    writeFileSync(patchPath, hasNode ? `${without.trimEnd()}\n` : `${without.split('\n').filter(l => l.trim().startsWith('#')).join('\n')}\n[]\n`)
    return
  }
  const cleaned = without.replace(/(^|\n)\s*\[\]\s*(?=\n|$)/g, '\n').trim()
  writeFileSync(patchPath, cleaned.length === 0 ? `${block}\n` : `${cleaned}\n\n${block}\n`)
}

function codexMcpInstalled()          {
  const configPath = codexConfigPath()
  return existsSync(configPath) && readFileSync(configPath, 'utf8').includes('[mcp_servers.peerbridge]')
}

function installCodexMcp(codexBin        )       {
  const configPath = codexConfigPath()
  mkdirSync(dirname(configPath), { recursive: true })
  let content = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  const lines = content.split('\n')
  const header = lines.findIndex(line => /^\s*\[mcp_servers\.peerbridge\]\s*(?:#.*)?$/.test(line))
  if (header !== -1) {
    let end = header + 1
    while (end < lines.length && !lines[end] .trimStart().startsWith('[')) end++
    const kept           = []
    for (let i = header + 1; i < end; i++) {
      const line = lines[i]
      if (/^\s*command\s*=/.test(line)) continue
      if (/^\s*args\s*=/.test(line)) {
        let depth = 0
        let quote = ''
        let escaped = false
        let opened = false
        for (; i < end; i++) {
          const value = lines[i]
          for (const char of value) {
            if (quote) {
              if (escaped) escaped = false
              else if (char === '\\' && quote === '"') escaped = true
              else if (char === quote) quote = ''
            } else if (char === '#') break
            else if (char === '"' || char === "'") quote = char
            else if (char === '[') { opened = true; depth++ }
            else if (char === ']') depth--
          }
          if (!opened || depth === 0) break
        }
        if (depth !== 0) throw new Error('PeerBridge MCP args 数组未闭合，未修改 Codex 配置')
        continue
      }
      kept.push(line)
    }
    lines.splice(header + 1, end - header - 1,
      `command = ${JSON.stringify(process.execPath)}`, `args = [${JSON.stringify(MCP_ENTRY)}]`, ...kept)
    writeFileSync(configPath, lines.join('\n'), 'utf8')
    return
  }
  const block = ['', CODEX_MARKER, '[mcp_servers.peerbridge]', `command = ${JSON.stringify(process.execPath)}`, `args = [${JSON.stringify(MCP_ENTRY)}]`, ''].join('\n')
  content = content.trimEnd().length === 0 ? block.trimStart() : `${content.trimEnd()}\n${block}`
  writeFileSync(configPath, content, 'utf8')
  void codexBin
}

function removeCodexMcp()       {
  const configPath = codexConfigPath()
  if (!existsSync(configPath)) return
  const lines = readFileSync(configPath, 'utf8').split('\n')
  const kept           = []
  let inBlock = false
  for (const line of lines) {
    if (line.startsWith(CODEX_MARKER)) continue
    if (line.trim().startsWith('[')) inBlock = /^\[mcp_servers\.peerbridge(?:\.[^\]]+)?\]\s*(?:#.*)?$/.test(line.trim())
    if (!inBlock) kept.push(line)
  }
  writeFileSync(configPath, `${kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`, 'utf8')
}

function pluginInstalled(profile        )          {
  const manifest = join(dshProfileDir(profile), 'package.json')
  if (!existsSync(manifest)) return false
  try {
    const deps = JSON.parse(readFileSync(manifest, 'utf8'))
    if (deps.dependencies?.['peerbridge-dsh-plugin'] === undefined) return false
  } catch { return false }
  const patch = join(dshProfileDir(profile), 'cordis.patch.yml')
  return existsSync(patch) && readFileSync(patch, 'utf8').includes('peerbridge-dsh-plugin')
}

export function cmdInstall()       {
  const config = readConfig()
  config.codexBin ??= guessCodexBin()
  config.dshBin ??= guessDshBin()
  writeConfig(config)
  // Unique immutable paths make pnpm refresh new files even after a previous file: install used hardlinks.
  const snapshot = pluginSnapshot()
  const installedProfiles = profiles()
  for (const profile of installedProfiles) {
    runDsh(config.dshBin , ['plugin', '--profile', profile, 'add', `file:${snapshot}`])
    upsertPatchRow(profile, true)
  }
  installCodexMcp(config.codexBin )
  console.log('已安装：')
  console.log(`  · DSH 插件 → profile ${installedProfiles.join(' / ')}（宿主重启后加载新版工具）`)
  console.log(`  · Codex MCP → ~/.codex/config.toml（Codex 下次启动生效）`)
  console.log(`  · 配置 → ${CONFIG_PATH}`)
  console.log('发送和提问时必须显式传入 workspace 与 session；可用 peer_workspaces / peer_sessions 查询目标。')
}

export function cmdUninstall(purge         )       {
  const config = readConfig()
  for (const profile of profiles()) {
    upsertPatchRow(profile, false)
    try { runDsh(config.dshBin ?? 'dsh', ['plugin', '--profile', profile, 'remove', 'peerbridge-dsh-plugin']) } catch { /* 依赖不存在时忽略 */ }
  }
  removeCodexMcp()
  console.log('已卸载：两端注册已摘除（patch/codex 配置无残留）。')
  if (purge) {
    if (existsSync(DATA_DIR)) {
      renameSync(DATA_DIR, `${DATA_DIR}.purged-${Date.now().toString(36)}`)
      console.log(`数据目录已归档：${DATA_DIR}.purged-*`)
    }
  } else {
    console.log(`数据目录保留：${DATA_DIR}（用 --purge 一并清理）`)
  }
}

export function cmdWebUrl(url        )       {
  const parsed = parseGatewayUrl(url)
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  const path = join(DATA_DIR, 'web-url.txt')
  writeFileSync(path, `${parsed.href}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
  console.log(`已写入 dsh Web 网关地址 → ${join(DATA_DIR, 'web-url.txt')}`)
}

export function cmdStatus()       {
  const config = readConfig()
  const webUrl = existsSync(join(DATA_DIR, 'web-url.txt'))
  console.log(`DSH 插件                : ${profiles().map(profile => `${profile}=${pluginInstalled(profile) ? '已装' : '未装'}`).join(' / ')}`)
  console.log(`Codex MCP 注册           : ${codexMcpInstalled() ? '已注册' : '未注册'}`)
  console.log('消息目标                : 每次显式传入 workspace 与 session（无默认绑定）')
  console.log(`Web 网关地址文件         : ${webUrl ? '存在（宿主重启后可能需要更新）' : '缺失（启动 dsh web 后执行 peerbridge weburl <地址>）'}`)
  console.log(`codex CLI / dsh CLI      : ${config.codexBin ?? guessCodexBin()} / ${config.dshBin ?? guessDshBin()}`)
}
