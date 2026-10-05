import { describe, expect, test } from 'claude-code/testing'

import {
  EMPTY_BEST,
  EMPTY_RUN,
  kindOf,
  land,
  mergeBest,
  perfectBonus,
  rankOf,
  smash,
  targetOf,
} from '../hooks/combo'

describe('combo engine', () => {
  test('classifies tool calls into moves', async () => {
    expect(kindOf('Read', undefined)).toBe('read')
    expect(kindOf('Bash', 'pnpm --filter @conduit/web test')).toBe('test')
    expect(kindOf('Bash', 'git commit -m "T4: schema"')).toBe('commit')
    expect(kindOf('Bash', 'ls -la')).toBe('bash')
    expect(kindOf('mcp__playwright__browser_click', undefined)).toBe('mcp')
  })

  test('hits build the combo and rank up at the thresholds', async () => {
    let fight = EMPTY_RUN
    for (let i = 0; i < 10; i += 1) fight = land(fight, EMPTY_BEST, 'read', 'a.ts')
    expect(fight.combo).toBe(10)
    expect(rankOf(fight.combo)?.letter).toBe('B')
    expect(fight.last?.rankUp).toBe('B BLAZING')
  })

  test('an error breaks the chain and remembers what broke it', async () => {
    let fight = land(land(EMPTY_RUN, EMPTY_BEST, 'edit', 'a.ts'), EMPTY_BEST, 'edit', 'b.ts')
    fight = smash(fight, 'test', 'pnpm test')
    expect(fight.combo).toBe(0)
    expect(fight.broken).toEqual({ combo: 2, by: 'pnpm test' })
    expect(fight.testsRed).toBe(true)
    expect(fight.turnClean).toBe(false)
  })

  test('a passing test after a failing one is a COMEBACK', async () => {
    const fight = land(smash(EMPTY_RUN, 'test', 'pnpm test'), EMPTY_BEST, 'test', 'pnpm test')
    expect(fight.last?.special).toBe('COMEBACK!')
    expect(fight.testsRed).toBe(false)
  })

  test('read, edit, passing test lands the TATSUMAKI once', async () => {
    let fight = land(EMPTY_RUN, EMPTY_BEST, 'read', 'a.ts')
    fight = land(fight, EMPTY_BEST, 'edit', 'a.ts')
    fight = land(fight, EMPTY_BEST, 'test', 'pnpm test')
    expect(fight.last?.special).toBe('RED→GREEN TATSUMAKI')
    fight = land(fight, EMPTY_BEST, 'test', 'pnpm test')
    expect(fight.last?.special).toBe(null)
  })

  test('a clean turn of 8 hits earns a perfect bonus, a dirty one none', async () => {
    let fight = EMPTY_RUN
    for (let i = 0; i < 8; i += 1) fight = land(fight, EMPTY_BEST, 'read', 'a.ts')
    expect(perfectBonus(fight)).toBe(80)
    expect(perfectBonus(smash(fight, 'bash', 'x'))).toBe(0)
  })

  test('the all-time record only ever goes up', async () => {
    const fight = { ...EMPTY_RUN, maxCombo: 12, score: 900 }
    const best = mergeBest({ combo: 30, score: 500, at: null }, fight, 'now')
    expect(best).toEqual({ combo: 30, score: 900, at: 'now' })
  })

  test('targets are file basenames or a command head', async () => {
    expect(targetOf({ file_path: '/home/x/capture-sync.ts' })).toBe('capture-sync.ts')
    expect(targetOf({ command: 'pnpm test\necho done' })).toBe('pnpm test')
  })
})

describe('in a session', () => {
  test('clean calls land hits and an errored call breaks the combo', async ($, on) => {
    const lines: (string | undefined)[] = []
    const toasts: string[] = []
    on('ui.status', async (_$, e) => {
      lines.push(e.text)
      return { value: undefined }
    })
    on('ui.toast', async (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('tool.call', async (_$, e) =>
      e.tool_use_id.startsWith('boom')
        ? { isError: true, result: 'exit 1', text: 'exit 1' }
        : { result: 'ok' },
    )

    await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a.ts' })
    await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/a.ts', old_string: 'a', new_string: 'b' })
    expect(lines.at(-1)).toBe('⚡ x2 · 35 pts')

    await $.tool.call({ tool: 'Bash', tool_use_id: 'boom1', command: 'pnpm test' })
    expect(lines.at(-1)).toBe('✖ combo x2 broken')

    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pnpm test' })
    expect(toasts.some(text => text.includes('COMEBACK!'))).toBe(true)
  })
})
