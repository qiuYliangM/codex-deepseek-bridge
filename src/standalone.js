/**
 * PeerBridge 独立 CLI（无 Hub 架构）：一次性安装/卸载，无守护进程。
 *
 *   peerbridge install                 向一个 profile 安装标准 DSH bundle
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
import { migrateLegacyPatch } from '../bridges/dsh/peerbridge-dsh-plugin/src/legacy-migration.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = dataDir()
const CONFIG_PATH = join(DATA_DIR, 'config.json')
const PLUGIN_PATH = join(ROOT, 'bridges', 'dsh', 'peerbridge-dsh-plugin')

const CODEX_MARKER = '# PeerBridge: peer collaboration bridge (managed by peerbridge CLI; remove via peerbridge uninstall)'

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

function codexMcpInstalled()          {
  const configPath = codexConfigPath()
  return existsSync(configPath) && readFileSync(configPath, 'utf8').includes('[mcp_servers.peerbridge]')
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
    if (deps.dsh?.profile?.bundles?.includes('peerbridge-dsh-plugin')) return true
  } catch { return false }
  const patch = join(dshProfileDir(profile), 'cordis.patch.yml')
  return existsSync(patch) && readFileSync(patch, 'utf8').includes('peerbridge-dsh-plugin')
}

export function cmdInstall(requestedProfile)       {
  const config = readConfig()
  config.codexBin ??= guessCodexBin()
  config.dshBin ??= guessDshBin()
  writeConfig(config)
  // Unique immutable paths make pnpm refresh new files even after a previous file: install used hardlinks.
  const snapshot = pluginSnapshot()
  const profile = requestedProfile || (existsSync(dshProfileDir('desktop')) ? 'desktop' : 'web')
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(profile)) throw new Error('profile 名称无效')
  migrateLegacyPatch(join(dshProfileDir(profile), 'cordis.patch.yml'))
  runDsh(config.dshBin , ['plugin', '--profile', profile, 'add', `file:${snapshot}`])
  console.log('已安装：')
  console.log(`  · 标准 DSH bundle → profile ${profile}（需要时重启 DSH）`)
  console.log('  · Codex MCP 由该插件启用时自动注册；无需再运行独立安装器')
  console.log(`  · 配置 → ${CONFIG_PATH}`)
  console.log('发送和提问时必须显式传入 workspace 与 session；可用 peer_workspaces / peer_sessions 查询目标。')
}

export function cmdUninstall(purge         )       {
  const config = readConfig()
  for (const profile of profiles()) {
    migrateLegacyPatch(join(dshProfileDir(profile), 'cordis.patch.yml'))
    try { runDsh(config.dshBin ?? 'dsh', ['plugin', '--profile', profile, 'remove', 'peerbridge-dsh-plugin']) } catch { /* 依赖不存在时忽略 */ }
  }
  const legacyConfig = codexConfigPath()
  if (existsSync(legacyConfig)) {
    const content = readFileSync(legacyConfig, 'utf8')
    if (content.includes(CODEX_MARKER) && /args\s*=\s*\[[^\]]*codex-mcp\.mjs/.test(content)) removeCodexMcp()
  }
  console.log('已请求移除 DSH bundle；宿主运行时会清理其 Codex MCP。离线卸载后请检查 Codex 中是否保留失效连接。')
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
