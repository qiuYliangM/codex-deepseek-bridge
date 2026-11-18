import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'dist/package-manifest.json')))
const tarball = join(root, 'dist', manifest.filename)
assert.equal(createHash('sha256').update(readFileSync(tarball)).digest('hex'), manifest.sha256)
const files = new Set(manifest.files.map(file => file.path))
for (const path of ['LICENSE', 'bin/peerbridge.mjs', 'bin/codex-mcp.mjs', 'src/standalone.js', 'src/codex/mcp.js', 'bridges/dsh/peerbridge-dsh-plugin/LICENSE', 'bridges/dsh/peerbridge-dsh-plugin/src/adapters.js', 'bridges/dsh/peerbridge-dsh-plugin/vendor/ws/LICENSE']) {
  assert.ok(files.has(path), `Missing runtime/license file: ${path}`)
}
for (const path of files) assert.ok(!/(^|\/)(node_modules|\.git|\.peerbridge|\.env|logs)(\/|$)|\.(log|deb)$|^src\/(hub|dsh|console)\//.test(path), `Unexpected package file: ${path}`)
const temporary = mkdtempSync(join(tmpdir(), 'peerbridge-package-'))
try {
  const prefix = join(temporary, 'install with spaces')
  const env = { ...process.env, HOME: join(temporary, 'home'), CODEX_HOME: join(temporary, 'codex'), DSH_HOME: join(temporary, 'dsh'), PEERBRIDGE_HOME: join(temporary, 'bridge'), npm_config_cache: join(temporary, 'npm-cache') }
  mkdirSync(env.HOME)
  execFileSync(process.execPath, [process.env.npm_execpath, 'install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--offline', tarball], {
    env, encoding: 'utf8', timeout: 30000,
  })
  const installed = join(prefix, 'node_modules/peerbridge')
  const help = execFileSync(process.execPath, [join(installed, 'bin/peerbridge.mjs'), '--help'], { env, encoding: 'utf8', timeout: 5000 })
  assert.match(help, /peerbridge install/)
  if (process.platform !== 'win32') {
    const commandHelp = execFileSync(join(prefix, 'node_modules/.bin/peerbridge'), ['--help'], { env, encoding: 'utf8', timeout: 5000 })
    assert.match(commandHelp, /peerbridge install/)
  }
  assert.ok(existsSync(join(installed, 'bridges/dsh/peerbridge-dsh-plugin/vendor/ws/wrapper.mjs')))
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ].map(value => JSON.stringify(value)).join('\n') + '\n'
  const output = execFileSync(process.execPath, [join(installed, 'bin/codex-mcp.mjs')], { input, env, encoding: 'utf8', timeout: 5000 })
  const messages = output.trim().split('\n').map(line => JSON.parse(line))
  assert.equal(messages.find(message => message.id === 1).result.serverInfo.version, manifest.version)
  const tools = messages.find(message => message.id === 2).result.tools
  assert.equal(tools.length, 12)
  assert.ok(tools.some(tool => tool.name === 'peer_create_workspace'))
  console.log('Tarball install, CLI and all 12 MCP tools passed in an isolated path with spaces.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
