import { runTool, toolDefinitions } from './tools.js'

export const VERSION = '0.5.0'
const versions = new Set(['2025-03-26', '2025-06-18', '2025-11-25'])

export function toolSchema(parameters) {
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(parameters).map(([key, { required: _, ...value }]) => [key, value])),
    required: Object.entries(parameters).filter(([, value]) => value.required).map(([key]) => key),
    additionalProperties: false,
  }
}

export async function dispatchMcp(method, params = {}, { signal, sourceSession, adapter } = {}) {
  switch (method) {
    case 'initialize': return {
      protocolVersion: versions.has(params.protocolVersion) ? params.protocolVersion : '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'peerbridge-codex-bridge', title: 'Codex DeepSeek Bridge', version: VERSION },
    }
    case 'ping': return {}
    case 'tools/list': return { tools: toolDefinitions.map(tool => ({
      name: tool.name, description: tool.description, inputSchema: toolSchema(tool.parameters),
    })) }
    case 'tools/call': {
      try {
        if (typeof params.name !== 'string') throw new Error('工具名必须是字符串')
        const result = await runTool('dsh', params.name, params.arguments ?? {}, { sourceSession, signal, adapter })
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false }
      } catch (error) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: {
          code: error.code || 'PEER_ERROR', message: error.message || String(error), details: error.details, nextTools: error.nextTools,
        } }) }], isError: true }
      }
    }
    default: throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 })
  }
}
