import { expect, test } from 'claude-code/testing'

import { isWaiting, parsePipeline } from './parse'

// A sample pipeline.md, shaped like a live run. The links are fake.
const LIVE = "Stages: \u2713 Setup \u00b7 \u2713 Scout \u00b7 \u2713 Brief \u00b7 \u2713 Baseline \u00b7 \u2713 Directions \u00b7 \u2713 Design \u00b7 \u25cf Crit 3/4 \u00b7 \u25cb Revise \u00b7 \u25cb Your pick \u00b7 \u25cb Figma\nNow: Crit. The UX/UI crit agent is still reviewing.\nHelpers: \u2713 scout \u00b7 \u2713 baseline \u00b7 \u2713 designer A \u00b7 \u2713 designer B \u00b7 \u2713 designer C \u00b7 \u2713 crit-brief \u00b7 \u25cf crit-ux \u00b7 \u2713 crit-platform \u00b7 \u2713 crit-a11y\nWaiting on you: nothing\n\nBaseline: [canvas](https://example.com/canvas/baseline) \u2713\n\nSettings Hub     Round 1      Crit     Round 2    Your pick    Figma\n[Dir A](https://example.com/canvas/dir-a)   \u2713            \u25cf 3/4    \u25cb          \u25cb            \u25cb\n[Dir B](https://example.com/canvas/dir-b)   \u2713            \u25cf 3/4    \u25cb          \u25cb            \u25cb\n[Dir C](https://example.com/canvas/dir-c)   \u2713            \u25cf 3/4    \u25cb          \u25cb            \u25cb\n"

const WAITING = LIVE.replace('Waiting on you: nothing', 'Waiting on you: pick a direction (A, B or C)')

const EARLY = 'Stages: ✓ Setup · – Scout skipped · ● Brief · ○ Baseline\nNow: Asking the prompter about the brief.\n'

const PANE = {
  plugin: 'idea-to-design',
  component: 'Pane',
  requestId: 'pipeline',
  props: {
    title: 'Design run',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const seed = (text: string) => ({
  value: {
    value: {
      shape: 'pipeline-1',
      value: { path: '/h/design-runs/settings-redesign/pipeline.md', slug: 'settings-redesign', mtimeMs: 1, text },
    },
    version: 1,
  },
})

test('the parser reads the live file', () => {
  const p = parsePipeline(LIVE)
  expect(p.stages.length).toBe(10)
  expect(p.stages[6]?.label).toBe('Crit')
  expect(p.stages[6]?.extra).toMatch(/^\d\/4$/)
  expect(p.stages[8]?.label).toBe('Your pick')
  expect(p.now?.startsWith('Crit.')).toBe(true)
  expect(p.helpers.map(h => h.label)).toContain('designer A')
  expect(isWaiting(p.waiting)).toBe(false)
  const table = p.blocks.find(b => b.kind === 'table')
  expect(table?.kind).toBe('table')
  if (table?.kind === 'table') {
    expect(table.rows.length).toBe(4)
    expect(table.widths[0]).toBe(12)
    expect(table.rows[1]?.[0]?.[0]).toEqual({
      kind: 'link',
      text: 'Dir A',
      href: 'https://example.com/canvas/dir-a',
    })
  }
})

test('an early file with a skipped stage', () => {
  const p = parsePipeline(EARLY)
  expect(p.stages[1]).toEqual({ mark: '–', label: 'Scout', extra: 'skipped' })
  expect(p.blocks.length).toBe(0)
  expect(isWaiting('pick a direction')).toBe(true)
})

test('the panel draws the live file on every surface', async ($, on) => {
  on('state.get', () => seed(LIVE))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Link', text: /Dir A/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● Crit \d\/4/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Waiting on you: nothing/ })).toBeDefined()
    await ui.unmount()
  }
})

test('waiting on the prompter is loud', async ($, on) => {
  on('state.get', () => seed(WAITING))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /⏸ Waiting on you/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /pick a direction/ })).toBeDefined()
  await ui.unmount()
})

test('no run, no table', async ($, on) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('No active design run.')
  await ui.unmount()
})

// Stands in for the file system: one run beside the working folder.
function fakeDisk(on: any, ageMs: number, opened: string[], closed: string[]) {
  const NOW = 1_800_000_000_000
  const RUNS = '/Users/x/Developer/design-runs'
  let panes: { id: string }[] = []
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'pipeline' } }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  on('clock.now', () => ({ value: NOW }))
  on('env.get', () => ({ value: '/Users/x' }))
  on('session.cwd', () => ({ value: `${RUNS}/settings-redesign` }))
  on('fs.list', (_: unknown, e: any) => ({
    value:
      e.path === RUNS
        ? [{ name: 'settings-redesign', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }]
        : [],
  }))
  on('fs.stat', (_: unknown, e: any) =>
    e.path === `${RUNS}/settings-redesign/pipeline.md`
      ? { value: { kind: 'file', size: 10, mtimeMs: NOW - ageMs, isLink: false } }
      : { deny: 'ENOENT' },
  )
  on('fs.read', () => ({ value: LIVE }))
  on('ui.panes', () => ({ value: panes }))
  on('ui.open', (_: unknown, e: any) => {
    opened.push(e.id)
    panes = [{ id: e.id }]
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_: unknown, e: any) => {
    closed.push(e.id)
    panes = []
    return { value: undefined }
  })
}

test('a fresh run opens the panel', async ($, on) => {
  const opened: string[] = []
  fakeDisk(on, 60_000, opened, [])
  await $.session.start({ cwd: '/Users/x/Developer', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual(['pipeline'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /design-runs\/settings-redesign/ })).toBeDefined()
  await ui.unmount()
})

test('a run older than a day stays hidden', async ($, on) => {
  const opened: string[] = []
  fakeDisk(on, 25 * 60 * 60 * 1000, opened, [])
  await $.session.start({ cwd: '/Users/x/Developer', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})
