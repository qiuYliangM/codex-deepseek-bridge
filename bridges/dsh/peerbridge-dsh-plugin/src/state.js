import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const dataDir = () => process.env.PEERBRIDGE_HOME || join(homedir(), '.peerbridge')

export function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw new Error(`无法读取 ${path}: ${error.message}`)
  }
}

export function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}

export function readConfig() {
  const config = readJson(join(dataDir(), 'config.json'), {})
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('PeerBridge config.json 必须是 JSON 对象')
  return config
}

export function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} 必须是非空字符串`)
  return value.trim()
}

export function boundedNumber(value, fallback, min, max) {
  return Math.min(Math.max(Math.trunc(Number.isFinite(value) ? value : fallback), min), max)
}
