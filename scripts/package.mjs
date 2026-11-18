import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(root, 'dist')
if (!process.env.npm_execpath) throw new Error('Run this script with npm run package')
mkdirSync(destination, { recursive: true })
const output = execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
  cwd: root, encoding: 'utf8', timeout: 60000,
})
const [manifest] = JSON.parse(output)
const sha256 = createHash('sha256').update(readFileSync(join(destination, manifest.filename))).digest('hex')
writeFileSync(join(destination, 'SHA256SUMS'), `${sha256}  ${manifest.filename}\n`)
writeFileSync(join(destination, 'package-manifest.json'), JSON.stringify({ ...manifest, sha256 }, null, 2) + '\n')
console.log(`${manifest.filename}: ${manifest.entryCount} files, ${manifest.size} bytes`)
