import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { withCodex } from './codex-client.js'
import { dataDir } from './state.js'

function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(temp, path)
  chmodSync(path, 0o600)
}

function load(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

async function locked(path, run) {
  const lock = `${path}.lock`
  for (let retry = 0; ; retry++) {
    let fd
    try { fd = openSync(lock, 'wx', 0o600) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        const owner = load(lock)
        if (Number.isInteger(owner?.pid) && !alive(owner.pid)) { unlinkSync(lock); continue }
      } catch (error) {
        if (error.code === 'ENOENT') continue
        // A newly acquired lock may not have its JSON yet. Never steal it.
      }
      if (retry >= 200) throw new Error('另一个进程正在更新 Codex MCP 配置，请稍后重试')
      await delay(50); continue
    }
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid })); return await run() }
    finally { closeSync(fd); unlinkSync(lock) }
  }
}

export function registrationLocation({ serverName = 'peerbridge', codexHome = process.env.CODEX_HOME || join(homedir(), '.codex'), directory = dataDir() } = {}) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(serverName)) throw new Error('mcpServerName 必须是 1–64 位字母、数字、下划线或连字符')
  const home = canonical(codexHome)
  const key = createHash('sha256').update(pathIdentity(home)).digest('hex').slice(0, 20)
  const dir = join(directory, 'registrations')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return { path: join(dir, `${serverName}-${key}.json`), home, serverName }
}

function canonical(path) {
  const absolute = resolve(path)
  try { return realpathSync.native(absolute) } catch {
    const parent = dirname(absolute)
    return parent === absolute ? absolute : join(canonical(parent), basename(absolute))
  }
}

const pathIdentity = path => process.platform === 'win32' ? canonical(path).toLowerCase() : canonical(path)

export async function registrationSecret(options) {
  const location = registrationLocation(options)
  return locked(location.path, () => {
    const existing = load(location.path)
    if (existing && (existing.schema !== 1 || typeof existing.token !== 'string' || !/^[a-f0-9]{64}$/.test(existing.token))) throw new Error('桥接注册记录损坏，未修改 Codex 配置')
    const record = existing || { schema: 1, token: randomBytes(32).toString('hex'), active: false }
    if (!existing) save(location.path, record)
    return record.token
  })
}

function ownsTransport(block, record) {
  return typeof record?.url === 'string' && block?.url === record.url && typeof record?.token === 'string'
    && block?.http_headers?.Authorization === `Bearer ${record.token}`
}

function legacy(block, file) {
  if (typeof block?.command !== 'string' || !Array.isArray(block.args)
    || !block.args.some(value => typeof value === 'string' && /[\\/]bin[\\/]codex-mcp\.mjs$/.test(value))) return false
  return existsSync(file) && readFileSync(file, 'utf8').includes('# PeerBridge: peer collaboration bridge (managed by peerbridge CLI; remove via peerbridge uninstall)')
}

async function snapshot(client, home, serverName) {
  const read = await client.call('config/read', { includeLayers: true })
  const file = join(home, 'config.toml')
  const layer = read.layers?.find(layer => layer.name?.type === 'user' && pathIdentity(layer.name.file) === pathIdentity(file))
  if (!layer || typeof layer.version !== 'string') throw new Error('当前 Codex 未返回可校验版本的用户配置层，未修改配置')
  return { file, version: layer.version, block: layer.config?.mcp_servers?.[serverName], effectiveBlock: read.config?.mcp_servers?.[serverName] }
}

async function edit(client, state, serverName, value) {
  const written = await client.call('config/batchWrite', {
    filePath: state.file, expectedVersion: state.version,
    edits: [{ keyPath: `mcp_servers.${serverName}`, mergeStrategy: 'replace', value }],
    reloadUserConfig: true,
  })
  if (written.status !== 'ok') throw new Error('Codex 未确认 MCP 配置更新成功')
  // The bearer token is intentionally confined to the user's private config.
  chmodSync(state.file, 0o600)
  return written
}

const conflict = error => /version|conflict|concurrent/i.test(error.message)

// Use Codex's own TOML parser/writer and expectedVersion compare-and-swap.
// No regex edits of user TOML; no project trust or model execution requests.
export async function configureCodex({ profileDir, url, token, codexBin, codexHome, serverName = 'peerbridge', directory, signal, rpc = withCodex }) {
  const location = registrationLocation({ codexHome, serverName, directory })
  const profile = resolve(profileDir)
  const ownerId = randomUUID()
  const options = { codexBin, codexHome: location.home, signal }
  mkdirSync(location.home, { recursive: true, mode: 0o700 })
  await locked(location.path, async () => {
    const previous = load(location.path)
    if (previous?.token !== token) throw new Error('MCP 注册密钥与当前记录不匹配')
    if (previous.active && previous.ownerId && alive(previous.pid)) throw new Error('该 MCP 名称已由另一个活动 DSH 插件占用；请为另一 profile 设置不同的 mcpServerName')
    await rpc(options, async client => {
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted()
        const state = await snapshot(client, location.home, serverName)
        if (!state.block && state.effectiveBlock && !ownsTransport(state.effectiveBlock, previous)) {
          throw new Error(`Codex MCP ${serverName} 已由其他配置层提供，未覆盖；请设置不同的 mcpServerName`)
        }
        if (state.block && !ownsTransport(state.block, previous) && !legacy(state.block, state.file)) {
          throw new Error(`Codex MCP ${serverName} 已有其他连接，未覆盖；请设置不同的 mcpServerName`)
        }
        if (state.block && previous.profileDir && previous.profileDir !== profile && !legacy(state.block, state.file)) {
          throw new Error('该 MCP 名称属于另一 DSH profile，未替换其目标；请设置不同的 mcpServerName')
        }
        const block = { ...state.block }
        for (const key of ['command', 'args', 'env', 'env_vars', 'cwd', 'bearer_token_env_var', 'env_http_headers', 'http_headers_helper', 'auth', 'oauth']) delete block[key]
        Object.assign(block, { url, http_headers: { ...block.http_headers, Authorization: `Bearer ${token}` }, enabled: block.enabled ?? true, tool_timeout_sec: block.tool_timeout_sec ?? 910 })
        // Save the recovery intent before the config write. A killed process
        // leaves an attributable transport which the same profile can recover.
        const record = { ...previous, schema: 1, token, url, serverName, profileDir: profile, ownerId, pid: process.pid, active: false, pending: true,
          previousBlock: previous.previousBlock ?? state.block ?? null }
        save(location.path, record)
        try {
          await edit(client, state, serverName, block)
          save(location.path, { ...record, active: true, pending: false })
          return
        } catch (error) {
          if (attempt < 2 && conflict(error)) continue
          throw error
        }
      }
    })
  })
  return {
    location: location.path,
    async release() {
      // Disposal is independent of the request lifetime: disabling a plugin
      // first cancels calls, then still needs a working config writer.
      return locked(location.path, async () => {
        const record = load(location.path)
        if (record?.ownerId !== ownerId) return { removed: false, reason: 'ownership-changed' }
        try {
          const result = await rpc({ codexBin, codexHome: location.home }, async client => {
            for (let attempt = 0; ; attempt++) {
              const state = await snapshot(client, location.home, serverName)
              if (!state.block) return { removed: true }
              if (!ownsTransport(state.block, record)) return { removed: false, reason: 'user-changed-transport' }
              try { await edit(client, state, serverName, null); return { removed: true } }
              catch (error) { if (attempt < 2 && conflict(error)) continue; throw error }
            }
          })
          save(location.path, { ...record, active: false, pending: false, cleanup: result })
          return result
        } catch (error) {
          save(location.path, { ...record, active: false, pending: true, cleanup: { removed: false, reason: 'codex-config-unavailable' } })
          throw error
        }
      })
    },
  }
}
