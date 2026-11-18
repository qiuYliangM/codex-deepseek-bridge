import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
const runtime = JSON.parse(readFileSync(join(root, 'packaging/node-runtime.json')))
assert.ok(Object.hasOwn(runtime.sha256, target), 'Target: linux-x64, linux-arm64, win-x64, darwin-x64 or darwin-arm64')
const [platform, arch] = target.split('-')
assert.ok(platform === 'linux' ? process.platform === 'linux' : platform === 'win' ? process.platform === 'win32' : process.platform === 'darwin', 'Use the target OS to build its installer')
const manifest = JSON.parse(readFileSync(join(root, 'dist/package-manifest.json')))
const tarball = join(root, 'dist', manifest.filename)
assert.equal(createHash('sha256').update(readFileSync(tarball)).digest('hex'), manifest.sha256, 'Build the source package first')
const version = manifest.version
const work = join(root, '.build', target)
const payload = join(work, 'payload')
const base = platform === 'linux' ? join(payload, 'opt/codex-deepseek-bridge')
  : platform === 'darwin' ? join(payload, 'usr/local/lib/codex-deepseek-bridge') : payload
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', timeout: 240000, ...options })
rmSync(work, { recursive: true, force: true })
mkdirSync(join(base, 'app'), { recursive: true })
mkdirSync(join(base, 'runtime'), { recursive: true })
const cache = join(root, '.cache/node')
mkdirSync(cache, { recursive: true })
const stem = `node-v${runtime.version}-${target}`
const archiveName = `${stem}.${platform === 'win' ? 'zip' : 'tar.gz'}`
const archive = join(cache, archiveName)
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex')
if (!existsSync(archive) || digest(archive) !== runtime.sha256[target]) {
  run(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--output', archive, `https://nodejs.org/dist/v${runtime.version}/${archiveName}`])
}
assert.equal(digest(archive), runtime.sha256[target], 'Node.js archive checksum mismatch')
const extracted = join(work, 'node-distribution')
mkdirSync(extracted)
if (platform === 'win') {
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:PEERBRIDGE_ARCHIVE -DestinationPath $env:PEERBRIDGE_EXTRACT_TO'], {
    env: { ...process.env, PEERBRIDGE_ARCHIVE: archive, PEERBRIDGE_EXTRACT_TO: extracted },
  })
} else run('tar', ['-xzf', archive, '-C', extracted])
const distribution = join(extracted, stem)
const nodeName = platform === 'win' ? 'node.exe' : 'node'
copyFileSync(join(distribution, platform === 'win' ? nodeName : `bin/${nodeName}`), join(base, 'runtime', nodeName))
copyFileSync(join(distribution, 'LICENSE'), join(base, 'runtime/LICENSE'))
if (platform !== 'win') chmodSync(join(base, 'runtime', nodeName), 0o755)
run('tar', ['-xzf', tarball, '--strip-components=1', '-C', join(base, 'app')])
const gitSha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
writeFileSync(join(base, 'BUILD-INFO.json'), JSON.stringify({ name: 'Codex DeepSeek Bridge', version, target, nodeVersion: runtime.version, nodeArchiveSha256: runtime.sha256[target], sourceCommit: gitSha }, null, 2) + '\n')
copyFileSync(join(root, 'docs/installers.md'), join(base, 'INSTALL.md'))
const basename = `codex-deepseek-bridge_${version}_${platform === 'linux' ? (arch === 'x64' ? 'amd64' : 'arm64') : target}`
const output = join(root, 'dist', `${basename}.${platform === 'linux' ? 'deb' : platform === 'win' ? 'exe' : 'pkg'}`)

if (platform === 'win') {
  for (const [name, entry] of [['peerbridge', 'peerbridge.mjs'], ['peerbridge-codex-mcp', 'codex-mcp.mjs']]) {
    writeFileSync(join(base, `${name}.cmd`), `@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0app\\bin\\${entry}" %*\r\n`)
  }
  writeFileSync(join(base, 'Open Terminal.cmd'), '@echo off\r\nset "PATH=%~dp0;%~dp0runtime;%PATH%"\r\ncd /d "%~dp0"\r\ncall "%~dp0peerbridge.cmd" --help\r\n%ComSpec% /d /k\r\n')
  const uninstall = []
  const visit = (directory, relative = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}\\${entry.name}` : entry.name
      if (entry.isDirectory()) { visit(join(directory, entry.name), name); uninstall.push(`RMDir "$INSTDIR\\${name}"`) }
      else uninstall.push(`Delete "$INSTDIR\\${name}"`)
    }
  }
  visit(payload)
  const uninstallFile = join(work, 'uninstall-files.nsh')
  writeFileSync(uninstallFile, uninstall.join('\n') + '\n')
  const nsis = process.env.PEERBRIDGE_MAKENSIS || join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'NSIS/makensis.exe')
  run(nsis, ['/V2', `/DVERSION=${version}`, `/DPAYLOAD=${payload}`, `/DOUTPUT=${output}`, `/DUNINSTALL_FILES=${uninstallFile}`, join(root, 'packaging/windows.nsi')])
} else {
  const prefix = platform === 'linux' ? '/opt/codex-deepseek-bridge' : '/usr/local/lib/codex-deepseek-bridge'
  const bin = join(payload, platform === 'linux' ? 'usr/bin' : 'usr/local/bin')
  mkdirSync(bin, { recursive: true })
  for (const [name, entry] of [['peerbridge', 'peerbridge.mjs'], ['peerbridge-codex-mcp', 'codex-mcp.mjs']]) {
    writeFileSync(join(bin, name), `#!/bin/sh\nexec "${prefix}/runtime/node" "${prefix}/app/bin/${entry}" "$@"\n`, { mode: 0o755 })
  }
  if (platform === 'linux') {
    const control = join(payload, 'DEBIAN')
    mkdirSync(control)
    const size = directory => readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? size(join(directory, entry.name)) : statSync(join(directory, entry.name)).size), 0)
    writeFileSync(join(control, 'control'), `Package: codex-deepseek-bridge\nVersion: ${version}\nArchitecture: ${arch === 'x64' ? 'amd64' : 'arm64'}\nMaintainer: qiuYliangM <185303122+qiuYliangM@users.noreply.github.com>\nSection: utils\nPriority: optional\nInstalled-Size: ${Math.ceil(size(base) / 1024)}\nDepends: libc6 (>= 2.28), libstdc++6 (>= 8), libgcc-s1\nHomepage: https://github.com/qiuYliangM/codex-deepseek-bridge\nDescription: Local collaboration bridge for Codex and DeepSeek Harness\n Explicit project and session routing with bundled Node.js runtime.\n Clients are installed separately; run peerbridge install as your normal user.\n`)
    run('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', payload, output])
  } else {
    const scripts = join(work, 'scripts')
    mkdirSync(scripts)
    writeFileSync(join(scripts, 'preinstall'), `#!/bin/sh\nset -eu\nif [ "$(uname -m)" != "${arch === 'arm64' ? 'arm64' : 'x86_64'}" ]; then\n  echo "Please use the ${arch === 'arm64' ? 'Intel x64' : 'Apple Silicon ARM64'} installer for this Mac." >&2\n  exit 1\nfi\n`, { mode: 0o755 })
    run('pkgbuild', ['--root', payload, '--scripts', scripts, '--identifier', 'io.github.qiuYliangM.codex-deepseek-bridge', '--version', version, '--install-location', '/', '--ownership', 'recommended', output])
  }
}
writeFileSync(`${output}.sha256`, `${digest(output)}  ${output.split(/[\\/]/).at(-1)}\n`)
console.log(`Built ${output} (${statSync(output).size} bytes)`)
