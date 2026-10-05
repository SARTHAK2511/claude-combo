import { describe, expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'combo-meter',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

describe('the band', () => {
  test('draws the combo card on every surface, the pixel counter on the terminal', async ($, on) => {
    on('ui.status', async () => ({ value: undefined }))
    on('ui.toast', async () => ({ value: undefined }))
    on('tool.call', async () => ({ result: 'ok' }))

    for (let i = 0; i < 11; i += 1) {
      await $.tool.call({ tool: 'Read', tool_use_id: `r${i}`, file_path: `/src/file-${i}.ts` })
    }

    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await terminal.find({ key: 'counter' })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /BLAZING/ })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /JAB/ })).toBeDefined()
    await terminal.unmount()

    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: /x11/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('shows the K.O. line after a break', async ($, on) => {
    on('ui.status', async () => ({ value: undefined }))
    on('ui.toast', async () => ({ value: undefined }))
    on('tool.call', async (_$, e) =>
      e.tool_use_id === 'boom' ? { isError: true, result: 'exit 1', text: 'exit 1' } : { result: 'ok' },
    )

    await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 'boom', command: 'pnpm build' })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /K\.O\./ })).toBeDefined()
    await ui.unmount()
  })
})
