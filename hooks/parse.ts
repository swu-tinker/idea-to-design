// Reads the text of a run's pipeline.md into parts the panel draws.
// Pure functions only, so tests can call them directly.

export const MARKS = ['✓', '●', '○', '✗', '–'] as const
export type Mark = (typeof MARKS)[number]

// One stage or helper, like "● Crit 1/4": its mark, name, and any extra words.
export type Item = { mark: Mark | null; label: string; extra: string }

// A piece of one line: plain words, a link, or a status mark.
export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'mark'; mark: Mark }

export type Block =
  | { kind: 'line'; pieces: Piece[] }
  | { kind: 'table'; rows: Piece[][][]; widths: number[] }

export type Pipeline = {
  stages: Item[]
  now: string | null
  helpers: Item[]
  waiting: string | null
  blocks: Block[]
}

const STAGES = [
  'Setup',
  'Scout',
  'Brief',
  'Baseline',
  'Directions',
  'Design',
  'Crit',
  'Revise',
  'Your pick',
  'Build-out',
  'Figma',
]

const isMark = (s: string): s is Mark => (MARKS as readonly string[]).includes(s)

// "● Crit 1/4" -> { mark: ●, label: Crit, extra: 1/4 }.
// Also takes "Scout – skipped", with the mark after the name.
export function parseItem(raw: string, names: readonly string[] = []): Item {
  let text = raw.trim()
  let mark: Mark | null = null
  const first = text.charAt(0)
  if (isMark(first)) {
    mark = first
    text = text.slice(1).trim()
  } else {
    const found = MARKS.find(m => text.includes(` ${m}`))
    if (found) {
      mark = found
      text = text.replace(` ${found}`, '').trim()
    }
  }
  const lower = text.toLowerCase()
  const name = names.find(n => lower.startsWith(n.toLowerCase()))
  if (name) {
    return { mark, label: text.slice(0, name.length), extra: text.slice(name.length).trim() }
  }
  return { mark, label: text, extra: '' }
}

export function parseItems(line: string, names: readonly string[] = []): Item[] {
  return line
    .split(/\s+·\s+|\s+\|\s+/)
    .map(part => part.trim())
    .filter(part => part !== '' && part !== '…' && part !== '...')
    .map(part => parseItem(part, names))
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

// Splits a line into plain words, links, and status marks.
export function parseInline(line: string): Piece[] {
  const pieces: Piece[] = []
  const pushText = (text: string) => {
    let buf = ''
    for (const ch of text) {
      if (isMark(ch)) {
        if (buf) pieces.push({ kind: 'text', text: buf })
        buf = ''
        pieces.push({ kind: 'mark', mark: ch })
      } else {
        buf += ch
      }
    }
    if (buf) pieces.push({ kind: 'text', text: buf })
  }
  let last = 0
  for (const m of line.matchAll(LINK)) {
    const at = m.index ?? 0
    pushText(line.slice(last, at))
    pieces.push({ kind: 'link', text: m[1] ?? '', href: m[2] ?? '' })
    last = at + m[0].length
  }
  pushText(line.slice(last))
  return pieces
}

// How many terminal cells a piece list takes, with links shown by their text.
export function widthOf(pieces: readonly Piece[]): number {
  let n = 0
  for (const p of pieces) n += p.kind === 'mark' ? 1 : [...p.text].length
  return n
}

const cellsOf = (line: string) => line.trim().split(/\s{2,}|\t+/)

function toBlocks(lines: string[]): Block[] {
  const split = lines.map(cellsOf)
  const isTable =
    lines.length >= 2 &&
    (split[0]?.length ?? 0) >= 3 &&
    split.every(cells => cells.length >= 2)
  if (!isTable) {
    return lines.map(line => ({ kind: 'line', pieces: parseInline(line.trim()) }))
  }
  const rows = split.map(cells => cells.map(parseInline))
  const cols = Math.max(...rows.map(r => r.length))
  const widths: number[] = []
  for (let c = 0; c < cols; c++) {
    widths.push(Math.max(1, ...rows.map(r => {
      const cell = r[c]
      return cell ? widthOf(cell) : 0
    })))
  }
  return [{ kind: 'table', rows, widths }]
}

export function parsePipeline(text: string): Pipeline {
  const out: Pipeline = { stages: [], now: null, helpers: [], waiting: null, blocks: [] }
  const rest: string[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const head = /^\s*(Stages|Now|Helpers|Waiting on you)\s*:\s*(.*)$/i.exec(line)
    const key = head?.[1]?.toLowerCase()
    const value = head?.[2]?.trim() ?? ''
    if (key === 'stages') out.stages = parseItems(value, STAGES)
    else if (key === 'now') out.now = value
    else if (key === 'helpers') out.helpers = parseItems(value)
    else if (key === 'waiting on you') out.waiting = value
    else rest.push(line)
  }
  let group: string[] = []
  const flush = () => {
    if (group.length) out.blocks.push(...toBlocks(group))
    group = []
  }
  for (const line of rest) {
    if (line.trim() === '') flush()
    else group.push(line)
  }
  flush()
  return out
}

// True when the prompter must act: "Waiting on you" names something.
export function isWaiting(waiting: string | null): boolean {
  if (waiting === null) return false
  const w = waiting.trim().toLowerCase().replace(/[.!]$/, '')
  return w !== '' && w !== 'nothing' && w !== 'none' && w !== '-' && w !== '–'
}
