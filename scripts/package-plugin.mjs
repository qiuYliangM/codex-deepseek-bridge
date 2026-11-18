import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(root, 'dist')
if (!process.env.npm_execpath) throw new Error('Run npm run package')
mkdirSync(destination, { recursive: true })
const [manifest] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
  cwd: join(root, 'bridges/dsh/peerbridge-dsh-plugin'), encoding: 'utf8', timeout: 60000,
}))
const sha256 = createHash('sha256').update(readFileSync(join(destination, manifest.filename))).digest('hex')
writeFileSync(join(destination, 'PLUGIN-SHA256SUMS'), `${sha256}  ${manifest.filename}\n`)
writeFileSync(join(destination, 'plugin-manifest.json'), JSON.stringify({ ...manifest, sha256 }, null, 2) + '\n')
console.log(`${manifest.filename}: standard DSH bundle, ${manifest.entryCount} files, ${manifest.size} bytes`)
