import { defineTool } from '@deepseek-ai/dsh-tools'
import { runTool, toolDefinitions } from './tools.js'

export const name = 'peerbridge-dsh-plugin'
export const inject = ['tools']

export function apply(ctx) {
  for (const tool of toolDefinitions) {
    ctx.tools.register(defineTool({
      ...tool,
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, exec) {
        const value = await runTool('codex', tool.name, args, {
          sourceSession: exec.agent?.session?.id ?? exec.sessionId,
          signal: exec.signal,
        })
        return JSON.parse(JSON.stringify(value))
      },
    }))
  }
}
