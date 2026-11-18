import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { operationTools, PeerOperations, workspaceParameter, sessionParameter } from './operations.js'
import { boundedNumber, dataDir, requireText, writeJson } from './state.js'

export const toolDefinitions = [
  ...operationTools,
  ['peer_send', 'Send a message using explicit workspace and session arguments. Missing, nonexistent, archived or mismatched targets fail; list or create targets separately. Returns queue acceptance, not completion.', {
    workspace: workspaceParameter, session: sessionParameter, text: { type: 'string', required: true },
    requestId: { type: 'string', description: 'Optional stable DSH prompt request ID for retrying one logical message.' },
  }],
  ['peer_ask', 'Ask using explicit workspace and session arguments and wait for peer_answer. Invalid targets fail; list or create separately. Do not synchronously ask a peer that is already waiting on you.', {
    workspace: workspaceParameter, session: sessionParameter, question: { type: 'string', required: true }, timeoutSec: { type: 'number' },
  }],
  ['peer_answer', 'Answer a peer question using its q-xxxxxxxxxxxx questionId.', {
    questionId: { type: 'string', required: true }, answer: { type: 'string', required: true },
  }],
  ['peer_events', 'Read recent shared PeerBridge timeline entries.', { limit: { type: 'number' } }],
].map(([name, description, parameters]) => ({
  name, description,
  parameters: { ...parameters, ...(['peer_send', 'peer_ask'].includes(name) ? {
    sourceSession: { type: 'string', description: 'Legacy source attribution when host context is unavailable. Codex/DSH supply the current session automatically; a conflicting value fails. Does not choose the target.' },
  } : {}) },
}))

function timeline(side, kind, data, sessionId) {
  try {
    mkdirSync(dataDir(), { recursive: true, mode: 0o700 })
    appendFileSync(join(dataDir(), 'timeline.jsonl'), `${JSON.stringify({ t: Date.now(), side, kind, sessionId, data })}\n`, { mode: 0o600 })
  } catch { /* Observation does not change delivery results. */ }
}

export async function runTool(peer, name, args = {}, { sourceSession, sourceSessionLocked = false, signal, adapter } = {}) {
  signal?.throwIfAborted()
  const definition = toolDefinitions.find(tool => tool.name === name)
  if (!definition) throw new Error(`unknown tool: ${name}`)
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是对象')
  for (const [key, value] of Object.entries(args)) {
    const parameter = definition.parameters[key]
    if (!parameter) throw new Error(`未知参数 ${key}`)
    if (typeof value !== parameter.type || (parameter.type === 'number' && !Number.isFinite(value))) throw new Error(`${key} 必须是 ${parameter.type}`)
  }
  for (const [key, parameter] of Object.entries(definition.parameters)) {
    if (parameter.required && args[key] === undefined) throw new Error(`缺少参数 ${key}`)
  }
  if (sourceSessionLocked && args.sourceSession && args.sourceSession !== sourceSession) {
    throw Object.assign(new Error('sourceSession 与宿主当前会话不一致，未发送；请省略该参数以使用自动来源'), { code: 'SOURCE_SESSION_MISMATCH' })
  }
  sourceSession = sourceSessionLocked ? sourceSession : args.sourceSession || sourceSession
  const operations = new PeerOperations(peer, { sourceSession, signal, adapter })
  const side = peer === 'dsh' ? 'codex' : 'dsh'
  if (operationTools.some(tool => tool[0] === name)) {
    const result = await operations.execute(name, args)
    if (!['peer_status', 'peer_workspaces', 'peer_sessions'].includes(name)) timeline(side, name, result, sourceSession)
    return result
  }
  if (name === 'peer_send') {
    const text = requireText(args.text, 'text')
    const result = await operations.send(args, text)
    timeline(side, 'peer-message', { text: text.slice(0, 500), to: peer, ...result }, sourceSession)
    return result
  }
  if (name === 'peer_ask') {
    const question = requireText(args.question, 'question')
    const questionId = `q-${randomUUID().replaceAll('-', '').slice(0, 12)}`
    const timeout = AbortSignal.timeout(boundedNumber(args.timeoutSec, 300, 5, 900) * 1000)
    const lifetime = signal ? AbortSignal.any([signal, timeout]) : timeout
    const askOperations = new PeerOperations(peer, { sourceSession, signal: lifetime, adapter })
    try {
      await askOperations.send(args, `问题 ${questionId}\n${question}\n（请用 peer_answer 工具回答并引用问题 id）`)
      timeline(side, 'question', { questionId, question, to: peer }, sourceSession)
      const path = join(dataDir(), 'answers', `${questionId}.json`)
      for (;;) {
        lifetime.throwIfAborted()
        if (existsSync(path)) {
          const value = JSON.parse(readFileSync(path, 'utf8'))
          if (value.questionId !== questionId) throw new Error('回答的 questionId 不匹配')
          unlinkSync(path)
          return value
        }
        await delay(250, undefined, { signal: lifetime })
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (timeout.aborted) return { questionId, state: 'timeout' }
      throw error
    }
  }
  if (name === 'peer_answer') {
    const questionId = requireText(args.questionId, 'questionId')
    if (!/^q-[0-9a-f]{12}$/i.test(questionId)) throw new Error('questionId 格式无效')
    const answer = requireText(args.answer, 'answer')
    const directory = join(dataDir(), 'answers')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const payload = { questionId, answer, by: side, t: Date.now() }
    writeJson(join(directory, `${questionId}.json`), payload)
    timeline(side, 'answer', payload, sourceSession)
    return { answered: true, questionId }
  }
  if (name === 'peer_events') {
    const path = join(dataDir(), 'timeline.jsonl')
    const limit = boundedNumber(args.limit, 30, 0, 200)
    if (!limit || !existsSync(path)) return { entries: [] }
    const lines = readFileSync(path, 'utf8').split('\n').filter(line => line.trim())
    return { entries: lines.slice(-limit).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } }) }
  }
  throw new Error(`unknown tool: ${name}`)
}
