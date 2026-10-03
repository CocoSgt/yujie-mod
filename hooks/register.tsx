import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood, Tally } from '../types'
import { ART } from './art'

const PANE = 'yujie'
const TITLE = '雨姐工位'

const mood = atom({ plugin: 'yujie', key: 'mood' } as const, 'normal' as Mood)
const line = atom({ plugin: 'yujie', key: 'line' } as const, '来了老妹儿，今儿整点啥？')
const tally = atom({ plugin: 'yujie', key: 'tally' } as const, {
  edits: 0,
  commands: 0,
  failures: 0,
  blocked: 0,
} as Tally)
const isDialect = atom({ plugin: 'yujie', key: 'isDialect' } as const, false)

// Pixel art downsampled from Codex-drawn cartoon sheets (art.ts); two pixel rows share one
// terminal cell: the upper half block takes the top pixel as foreground, the bottom as background.
const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584

function sprite(m: Mood): { cells: string; columns: number; rows: number } {
  const grid = ART[m]
  const w = grid[0].length
  const h = grid.length / 2
  const words = new Uint32Array(w * h * 3)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const top = grid[y * 2][x]
      const bottom = grid[y * 2 + 1][x]
      const at = (y * w + x) * 3
      // An empty top half draws the lower half block instead, so no default foreground shows through.
      if (top === DEFAULT) {
        words[at] = bottom === DEFAULT ? 0x20 : LOWER
        words[at + 1] = bottom
        words[at + 2] = DEFAULT
      } else {
        words[at] = UPPER
        words[at + 1] = top
        words[at + 2] = bottom
      }
    }
  }
  return { cells: new Uint8Array(words.buffer).toBase64(), columns: w, rows: h }
}

const DIALECT = [
  '用户今天让“雨姐”陪着写代码。回复时用东北大姐热情、直爽、爱唠嗑的口吻，',
  '可以用“老妹儿”“整”“嘎嘎”“咋整”“得劲儿”这类东北话。',
  '代码、命令、文件名和技术结论保持准确，不为了口音牺牲正确性。',
].join('')

const DANGER = /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|git\s+push\s+.*--force|git\s+reset\s+--hard/

async function say($: EngineInterface, m: Mood, text: string) {
  await update($, mood, () => m)
  await update($, line, () => text)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'yujie', description: '打开雨姐工位面板' })
    await $.command.register({ name: 'yujie-talk', description: '开关东北话唠嗑模式' })
    await $.command.register({ name: 'yujie-bye', description: '雨姐下班' })
    $.ui.status('雨姐在岗 · 铁锅已热')
    // Nothing draws under claude -p or in tests; the pane is a nicety there.
    $.ui.open({ id: PANE, title: TITLE, columns: 44 }).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'yujie' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, columns: 44 })

    return { text: '雨姐工位已打开。' }
  })

  on('command.run', { command: 'yujie-talk' }, async $ => {
    const isOn = !(await read($, isDialect))
    await update($, isDialect, () => isOn)
    $.ui.invalidate('prompt.compose')
    await say($, 'happy', isOn ? '唠嗑模式开了，大姐跟你唠！' : '行，那大姐不唠了，正经干活。')

    return { text: isOn ? '东北话模式：开' : '东北话模式：关' }
  })

  on('command.run', { command: 'yujie-bye' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, columns: 70, focus: true })
    await say($, 'foot', '下班！姐这大脚丫子先歇会儿')
    $.ui.status('雨姐已下班 · 铁锅还温着')

    return { text: '雨姐下班了。' }
  })

  // Only the system prompt changes; the person's words stay as typed.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, isDialect))) {
      return composed
    }

    return {
      ...composed,
      sections: [...composed.sections, { id: 'yujie:dialect', text: DIALECT, scope: 'session' }],
    }
  })

  on('prompt.submit', async ($, e, next) => {
    await say($, 'normal', '听着呢，大姐这就给你整')

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (DANGER.test(e.command)) {
      await update($, tally, t => ({ ...t, blocked: t.blocked + 1 }))
      await say($, 'angry', '整这死出呢？这命令不好使！')
      $.ui.toast('雨姐：rm -rf？想都别想')
      // Bring her pane forward, even if another panel took the dock.
      // Nothing draws under claude -p or in tests; the pane is a nicety there.
    $.ui.open({ id: PANE, title: TITLE, columns: 44 }).catch(() => undefined)

      return { deny: '雨姐拦下了这条命令：它会删除或强行改写数据。请换一个更安全的做法，或者让用户自己执行。' }
    }

    await update($, tally, t => ({ ...t, commands: t.commands + 1 }))
    const ran = await next(e)
    // Test runners piped through tail exit 0, so read the output as well.
    const isRed = ran.isError === true || /ℹ fail [1-9]|# fail [1-9]|Exit code [1-9]/.test(ran.text ?? '')
    if (ran.deny === undefined && isRed) {
      await update($, tally, t => ({ ...t, failures: t.failures + 1 }))
      await say($, 'angry', '哎呀妈呀，又红了。别慌，大姐在呢')
      $.ui.toast('雨姐：报错了，瞅瞅日志')
    }

    return ran
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const t = await update($, tally, t => ({ ...t, edits: t.edits + 1 }))
      await say($, 'happy', `改完第 ${t.edits} 个文件了，手嘎嘎快！`)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.reason === 'answer') {
      await say($, 'happy', '活儿干完了，整挺好！')
      $.ui.toast('雨姐：这把得劲儿！')
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const text = await read($, line)

    return (
      <Box>
        <Text color="#e0567a">🍓 雨姐：</Text>
        <Text>{text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const r = $.ui.resolve(e)
    const { Box, Text } = r
    const m = await read($, mood)
    const text = await read($, line)
    const t = await read($, tally)
    const talk = await read($, isDialect)

    return (
      <Box flexDirection="column" paddingX={1}>
        {e.surface === 'terminal' ? (
          <r.Raster key="face" {...sprite(m)} />
        ) : (
          <Text>🍓</Text>
        )}
        <Text color="#e0567a" bold>
          {TITLE}
        </Text>
        <Text wrap="wrap">“{text}”</Text>
        <Text> </Text>
        <Text dimColor>改文件 {t.edits} · 跑命令 {t.commands}</Text>
        <Text dimColor>报错 {t.failures} · 拦下 {t.blocked}</Text>
        <Text dimColor>唠嗑模式 {talk ? '开' : '关'}</Text>
      </Box>
    )
  })
}
