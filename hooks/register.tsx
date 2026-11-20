// Pipeline panel: shows the newest idea-to-design run's pipeline.md beside
// the chat, and redraws it when the captain rewrites the file.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PipelineFile } from '../types'
import { isWaiting, parsePipeline } from './parse'
import type { Item, Mark, Piece } from './parse'

const PANE = 'pipeline'
const TITLE = 'Design run'
const POLL_MS = 2000
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_LEVELS = 8

// Change the shape tag when PipelineFile changes: it drops what an older version stored.
const pipeline = atom(
  { plugin: 'idea-to-design', key: 'pipeline' } as const,
  null as PipelineFile,
  { shape: 'pipeline-1' },
)

const COLOR: Record<Mark, string> = {
  '✓': 'success',
  '●': 'warning',
  '○': 'inactive',
  '✗': 'error',
  '–': 'inactive',
}

type Found = { path: string; slug: string; mtimeMs: number }

// Walks up from the working folder, at most to the home folder, and
// returns the most recently changed design-runs/*/pipeline.md.
async function findNewest($: EngineInterface): Promise<Found | null> {
  const cwd = (await $.session.cwd()).replace(/\/+$/, '') || '/'
  const home = ((await $.env.get('HOME')) ?? '').replace(/\/+$/, '')
  const isUnderHome = home !== '' && (cwd === home || cwd.startsWith(`${home}/`))
  let best: Found | null = null
  let dir = cwd
  for (let level = 0; level < MAX_LEVELS; level++) {
    const runs = `${dir === '/' ? '' : dir}/design-runs`
    const entries = await $.fs.list(runs).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'dir') continue
      const path = `${runs}/${entry.name}/pipeline.md`
      const stat = await $.fs.stat(path).catch(() => undefined)
      if (stat?.kind !== 'file') continue
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { path, slug: entry.name, mtimeMs: stat.mtimeMs }
      }
    }
    if (dir === '/' || (isUnderHome && dir === home)) break
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
  return best
}

// The path the person closed the panel on. It stays closed for that run
// until they run /pipeline. A new run opens it again.
let dismissed: string | null = null
let isBusy = false

async function isOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function refresh($: EngineInterface) {
  if (isBusy) return
  isBusy = true
  try {
    const now = await $.clock.now()
    const found = await findNewest($)
    const isFresh = found !== null && now - found.mtimeMs < MAX_AGE_MS
    const held = await read($, pipeline)
    if (!found || !isFresh) {
      if (held !== null) await update($, pipeline, () => null)
      if (await isOpen($)) await $.ui.close({ id: PANE })
      return
    }
    if (!held || held.path !== found.path || held.mtimeMs !== found.mtimeMs) {
      const text = await $.fs.read(found.path).catch(() => null)
      if (text !== null) await update($, pipeline, () => ({ ...found, text }))
    }
    if (dismissed !== found.path && !(await isOpen($))) {
      await $.ui.open({ id: PANE, title: TITLE })
    }
  } finally {
    isBusy = false
  }
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'pipeline',
      description: 'Show the idea-to-design run status panel',
    })
    $.clock.every(POLL_MS, () => void refresh($).catch(() => undefined))
    await refresh($).catch(() => undefined)
    return result
  })

  on('command.run', { command: 'pipeline' }, async $ => {
    dismissed = null
    await refresh($)
    const held = await read($, pipeline)
    if (!held) return { text: 'No idea-to-design run changed in the last 24 hours.' }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return {
      text: opened.isPlaced
        ? `Showing design-runs/${held.slug}.`
        : `Panel is waiting for room: ${opened.reason}`,
    }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      dismissed = (await read($, pipeline))?.path ?? null
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const held = await read($, pipeline)
    if (!held) return <Text dimColor>No active design run.</Text>
    const p = parsePipeline(held.text)
    const isNarrow = e.props.placement === 'widget'

    const mark = (m: Mark | null) =>
      m ? <Text color={COLOR[m]}>{m}</Text> : <Text dimColor>·</Text>

    const pieces = (list: readonly Piece[], bold = false) =>
      list.map(piece =>
        piece.kind === 'mark' ? (
          mark(piece.mark)
        ) : piece.kind === 'link' ? (
          <Link href={piece.href}>{piece.text}</Link>
        ) : (
          <Text weight={bold ? 'bold' : undefined}>{piece.text}</Text>
        ),
      )

    const stage = (item: Item) => {
      const name = item.extra ? `${item.label} ${item.extra}` : item.label
      if (item.mark === '●') {
        return (
          <Text inverse weight="bold" color="warning">
            {` ● ${name} `}
          </Text>
        )
      }
      return (
        <Text>
          {mark(item.mark)}
          <Text dimColor={item.mark === '✓' || item.mark === '–'}>{` ${name}`}</Text>
        </Text>
      )
    }

    const helper = (item: Item) => (
      <Text>
        {mark(item.mark)}
        <Text
          dimColor={item.mark === '✓'}
          weight={item.mark === '●' ? 'bold' : undefined}
        >{` ${item.label}${item.extra ? ` ${item.extra}` : ''}`}</Text>
      </Text>
    )

    const waiting = isWaiting(p.waiting)

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>design-runs/{held.slug}</Text>

        {waiting && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
            <Text color="warning" weight="bold">
              ⏸ Waiting on you
            </Text>
            <Text>{p.waiting}</Text>
          </Box>
        )}

        {p.stages.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {p.stages.map(stage)}
          </Box>
        )}

        {p.now && (
          <Text>
            <Text weight="bold">Now </Text>
            {p.now}
          </Text>
        )}

        {!isNarrow && p.helpers.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {p.helpers.map(helper)}
          </Box>
        )}

        {!isNarrow &&
          p.blocks.map(block =>
            block.kind === 'line' ? (
              <Text>{pieces(block.pieces)}</Text>
            ) : (
              <Box flexDirection="column">
                {block.rows.map((row, r) => (
                  <Box flexDirection="row">
                    {block.widths.map((width, c) => (
                      <Box width={width + 2} flexShrink={0}>
                        <Text wrap="truncate">{pieces(row[c] ?? [], r === 0)}</Text>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            ),
          )}

        {!waiting && p.waiting !== null && <Text dimColor>Waiting on you: nothing</Text>}
      </Box>
    )
  })
}
