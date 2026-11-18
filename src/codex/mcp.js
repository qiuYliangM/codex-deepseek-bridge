import { createInterface } from 'node:readline'
import { dispatchMcp } from '../../bridges/dsh/peerbridge-dsh-plugin/src/mcp-protocol.js'

const pending = new Map                                  ()
const sourceSession = process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID

const readline = createInterface({ input: process.stdin })
readline.on('line', line => {
  let message
  try { message = JSON.parse(line)                   } catch { return }
  if (message.method === 'notifications/cancelled') {
    pending.get(message.params?.requestId                   )?.abort(new Error('MCP 请求已取消'))
    return
  }
  if (message.id === undefined || !message.method) return
  const id = message.id
  const controller = new AbortController()
  pending.set(id, controller)
  void dispatchMcp(message.method, message.params || {}, { signal: controller.signal, sourceSession }).then(
    result => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`),
    error => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: String(error) } })}\n`),
  ).finally(() => pending.delete(id))
})
readline.on('close', () => {
  for (const controller of pending.values()) controller.abort(new Error('MCP 输入已关闭'))
})
