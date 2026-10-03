import { expect, test } from 'claude-code/testing'

test('rm -rf is denied before the tool runs', async ($, on) => {
  let ran = 0
  // Stands in for Claude Code: counts the calls that get past the mod
  on('tool.call', () => {
    ran += 1
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  const answer = await $.tool.call({ tool: 'Bash', command: 'rm -rf node_modules' })
  expect(answer.deny).toContain('雨姐拦下')
  expect(ran).toBe(0)
})

test('ordinary commands still run', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))

  const answer = await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(answer.deny).toBeUndefined()
})

test('/yujie-talk switches the dialect on and off', async $ => {
  expect((await $.command.run({ command: 'yujie-talk', args: '' })).text).toBe('东北话模式：开')
  expect((await $.command.run({ command: 'yujie-talk', args: '' })).text).toBe('东北话模式：关')
})
