import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
const [platform, arch] = target.split('-')
assert.equal(process.platform, platform === 'win' ? 'win32' : platform)
assert.equal(process.arch, arch, 'Run the native validation on the target architecture')
const base = platform === 'win' ? join(process.env.LOCALAPPDATA, 'Programs/CodexDeepSeekBridge')
  : platform === 'linux' ? '/opt/codex-deepseek-bridge' : '/usr/local/lib/codex-deepseek-bridge'
const node = join(base, 'runtime', platform === 'win' ? 'node.exe' : 'node')
const entry = join(base, 'app/bin/peerbridge.mjs')
const mcp = join(base, 'app/bin/codex-mcp.mjs')
const build = JSON.parse(readFileSync(join(base, 'BUILD-INFO.json')))
assert.equal(build.target, target)
const temporary = mkdtempSync(join(tmpdir(), 'bridge native test '))
try {
  const home = join(temporary, 'home')
  const bridge = join(temporary, 'bridge')
  mkdirSync(home)
  mkdirSync(bridge)
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex'), DSH_HOME: join(home, '.dsh'), PEERBRIDGE_HOME: bridge }
  // Confirm launchers do not depend on a system node being on PATH.
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH'
  env[pathKey] = platform === 'win' ? `${process.env.SystemRoot}\\System32` : '/nonexistent'
  const run = (executable, args, options = {}) => execFileSync(executable, args, { env, encoding: 'utf8', timeout: 30000, ...options })
  assert.equal(run(node, ['--version']).trim(), `v${build.nodeVersion}`)
  assert.match(run(node, [entry, '--help']), /Codex DeepSeek Bridge/)
  if (platform === 'win') {
    assert.match(run(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/c', 'peerbridge.cmd', '--help'], { cwd: base }), /peerbridge install/)
  } else {
    assert.match(run(platform === 'linux' ? '/usr/bin/peerbridge' : '/usr/local/bin/peerbridge', ['--help']), /peerbridge install/)
  }
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ].map(message => JSON.stringify(message)).join('\n') + '\n'
  const messages = run(node, [mcp], { input }).trim().split('\n').map(line => JSON.parse(line))
  assert.equal(messages.find(message => message.id === 1).result.serverInfo.version, build.version)
  assert.equal(messages.find(message => message.id === 2).result.tools.length, 12)
  const dsh = join(temporary, 'mock dsh.mjs')
  writeFileSync(dsh, `import{mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';const a=process.argv.slice(2);const p=join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]);mkdirSync(p,{recursive:true});writeFileSync(join(p,'package.json'),JSON.stringify({dependencies:a.includes('add')?{'peerbridge-dsh-plugin':a.at(-1)}:{},dsh:{profile:{bundles:a.includes('add')?['peerbridge-dsh-plugin']:[]}}}));`)
  writeFileSync(join(bridge, 'config.json'), JSON.stringify({ dshBin: dsh, codexBin: 'test-not-invoked' }))
  run(node, [entry, 'install'])
  assert.equal(existsSync(join(env.CODEX_HOME, 'config.toml')), false, 'Codex registration belongs to the running DSH plugin')
  for (const profile of ['web']) {
    const manifest = JSON.parse(readFileSync(join(env.DSH_HOME, 'profiles', profile, 'package.json')))
    const snapshot = manifest.dependencies['peerbridge-dsh-plugin'].slice(5)
    assert.ok(existsSync(join(snapshot, 'src/cli-command.js')))
    assert.ok(existsSync(join(snapshot, 'vendor/ws/LICENSE')))
  }
  run(node, [entry, 'uninstall'])
  assert.equal(existsSync(join(env.CODEX_HOME, 'config.toml')), false)
  const report = { target, version: build.version, nodeVersion: build.nodeVersion, sourceCommit: build.sourceCommit, installed: true, bundledRuntime: true, systemNodeRequired: false, cli: 'passed', mcpTools: 12, isolatedRegistration: 'bundle-installation-only', realClientModelTested: false, signed: false }
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist', `native-${target}.json`), JSON.stringify(report, null, 2) + '\n')
  console.log(`Native installed ${target}: bundled Node, CLI, 12 MCP tools and isolated registration passed.`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
