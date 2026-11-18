import { createInterface } from 'node:readline'
import { runTool, toolDefinitions } from '../../bridges/dsh/peerbridge-dsh-plugin/src/tools.js'

const pending = new Map                                  ()
const sourceSession = process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID

function schema(parameters                                         ) {
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(parameters).map(([key, { required: _, ...value }]) => [key, value])),
    required: Object.entries(parameters).filter(([, value]) => value.required).map(([key]) => key),
  }
}

async function dispatch(method        , params                         , signal             ) {
  switch (method) {
    case 'initialize': return {
      protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'peerbridge-codex-bridge', version: '0.4.4' },
    }
    case 'ping': return {}
    case 'tools/list': return { tools: toolDefinitions.map(tool => ({
      name: tool.name, description: tool.description, inputSchema: schema(tool.parameters),
    })) }
    case 'tools/call': {
      try {
        const result = await runTool('dsh', String(params.name), params.arguments                            || {}, { sourceSession, signal })
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false }
      } catch (error) {
        const failure = error
        return { content: [{ type: 'text', text: JSON.stringify({ error: {
          code: failure.code || 'PEER_ERROR', message: failure.message || String(error), details: failure.details, nextTools: failure.nextTools,
        } }) }], isError: true }
      }
    }
    default: throw new Error(`method not found: ${method}`)
  }
}

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
  void dispatch(message.method, message.params || {}, controller.signal).then(
    result => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`),
    error => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: String(error) } })}\n`),
  ).finally(() => pending.delete(id))
})
readline.on('close', () => {
  for (const controller of pending.values()) controller.abort(new Error('MCP 输入已关闭'))
})
