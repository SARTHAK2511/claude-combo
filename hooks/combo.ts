// The fight itself: pure functions over plain data, so the state updater can
// retry them on a version miss and the tests can drive them without an engine.
import type { ComboBest, ComboKind, ComboRun } from '../types'

// Each rank's heat runs from its first color to its second: the big combo
// number and the meter are shaded across it, the rank's name in the second.
export type Rank = { letter: string; name: string; at: number; heat: readonly [number, number] }

export const RANKS: readonly Rank[] = [
  { letter: 'D', name: 'DECENT', at: 3, heat: [0x6b7280, 0xa1a1aa] },
  { letter: 'C', name: 'CLEAN', at: 6, heat: [0x0891b2, 0x22d3ee] },
  { letter: 'B', name: 'BLAZING', at: 10, heat: [0x16a34a, 0x4ade80] },
  { letter: 'A', name: 'ATOMIC', at: 16, heat: [0xf59e0b, 0xfde047] },
  { letter: 'S', name: 'SHIPPING', at: 25, heat: [0xdb2777, 0xf9a8d4] },
  { letter: 'SS', name: 'SENIOR STAFF', at: 40, heat: [0xdc2626, 0xfb923c] },
  { letter: 'SSS', name: "SMOKIN' SHIP STYLE", at: 60, heat: [0xa855f7, 0xfacc15] },
]

/** Before the first rank: still warming up. */
export const WARMUP_HEAT: readonly [number, number] = [0x4b5563, 0x6b7280]

// Matches the test runners people actually type, wrapped in a package manager or not.
const TEST_COMMAND = /\b(test|tests|vitest|jest|pytest|mocha|ava|rspec|phpunit|go test|cargo test|test:[\w-]+)\b/
const COMMIT_COMMAND = /\bgit\s+commit\b/

const TRAIL_LENGTH = 6
const MAX_MULTIPLIER = 5
const BREAK_TOAST_AT = 5
const PERFECT_TURN_AT = 8

export type Move = { kind: ComboKind; move: string; base: number }

const MOVES: Record<ComboKind, Omit<Move, 'kind'>> = {
  read: { move: 'JAB', base: 10 },
  scout: { move: 'SCOUT', base: 10 },
  edit: { move: 'SLASH', base: 25 },
  write: { move: 'UPPERCUT', base: 30 },
  bash: { move: 'HADOUKEN', base: 20 },
  test: { move: 'RISING TEST', base: 50 },
  commit: { move: 'SEAL', base: 60 },
  agent: { move: 'ASSIST', base: 40 },
  web: { move: 'LONG RANGE', base: 15 },
  mcp: { move: 'SUMMON', base: 20 },
  meta: { move: 'FOCUS', base: 5 },
  other: { move: 'STRIKE', base: 10 },
}

/** Fixed bonuses for the special moves, checked in this order. */
const SPECIALS = {
  comeback: { name: 'COMEBACK!', bonus: 200 },
  flawless: { name: 'FLAWLESS VICTORY', bonus: 300 },
  tatsumaki: { name: 'RED→GREEN TATSUMAKI', bonus: 150 },
  seek: { name: 'SEEK & STRIKE', bonus: 80 },
  triple: { name: 'TRIPLE SLASH', bonus: 100 },
} as const

const FLAWLESS_AT = 20

export const EMPTY_RUN: ComboRun = {
  combo: 0,
  score: 0,
  maxCombo: 0,
  hits: 0,
  breaks: 0,
  parries: 0,
  specials: 0,
  trail: [],
  last: null,
  broken: null,
  testsRed: false,
  turnHits: 0,
  turnClean: true,
  isRecord: false,
}

export const EMPTY_BEST: ComboBest = { combo: 0, score: 0, at: null }

export function kindOf(tool: string, command: string | undefined): ComboKind {
  switch (tool) {
    case 'Read':
    case 'NotebookRead':
      return 'read'
    case 'Grep':
    case 'Glob':
    case 'LS':
    case 'ToolSearch':
      return 'scout'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'edit'
    case 'Write':
      return 'write'
    case 'Agent':
    case 'Task':
      return 'agent'
    case 'WebFetch':
    case 'WebSearch':
      return 'web'
    case 'TodoWrite':
    case 'Skill':
      return 'meta'
    case 'Bash':
      if (command !== undefined && COMMIT_COMMAND.test(command)) return 'commit'
      if (command !== undefined && TEST_COMMAND.test(command)) return 'test'
      return 'bash'
  }
  return tool.startsWith('mcp__') ? 'mcp' : 'other'
}

export function moveOf(kind: ComboKind): Move {
  return { kind, ...MOVES[kind] }
}

export function rankOf(combo: number): Rank | null {
  let found: Rank | null = null
  for (const rank of RANKS) {
    if (combo >= rank.at) found = rank
  }
  return found
}

export function nextRankOf(combo: number): Rank | null {
  return RANKS.find(rank => combo < rank.at) ?? null
}

export function multiplierOf(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / 10))
}

function endsWith(trail: readonly ComboKind[], tail: readonly ComboKind[]): boolean {
  if (trail.length < tail.length) return false
  const start = trail.length - tail.length
  return tail.every((kind, i) => trail[start + i] === kind)
}

function specialOf(
  run: ComboRun,
  trail: readonly ComboKind[],
  kind: ComboKind,
  combo: number,
): { name: string; bonus: number } | null {
  if (kind === 'test' && run.testsRed) return SPECIALS.comeback
  if (kind === 'commit' && combo >= FLAWLESS_AT) return SPECIALS.flawless
  if (endsWith(trail, ['read', 'edit', 'test'])) return SPECIALS.tatsumaki
  if (endsWith(trail, ['scout', 'read', 'edit'])) return SPECIALS.seek
  if (endsWith(trail, ['edit', 'edit', 'edit'])) return SPECIALS.triple
  return null
}

/** A tool call that came back clean. */
export function land(run: ComboRun, best: ComboBest, kind: ComboKind, target: string): ComboRun {
  const { move, base } = moveOf(kind)
  const combo = run.combo + 1
  const trail = [...run.trail, kind].slice(-TRAIL_LENGTH)
  const special = specialOf(run, trail, kind, combo)
  const points = base * multiplierOf(combo) + (special?.bonus ?? 0)
  const before = rankOf(run.combo)
  const after = rankOf(combo)
  const rankUp = after !== null && after !== before ? `${after.letter} ${after.name}` : null

  return {
    ...run,
    combo,
    score: run.score + points,
    maxCombo: Math.max(run.maxCombo, combo),
    hits: run.hits + 1,
    specials: run.specials + (special === null ? 0 : 1),
    // A special consumes its trail, so the same three calls never score twice.
    trail: special === null ? trail : [],
    last: { move, target, points, combo, special: special?.name ?? null, rankUp },
    broken: null,
    testsRed: kind === 'test' ? false : run.testsRed,
    turnHits: run.turnHits + 1,
    isRecord: run.isRecord || combo > best.combo,
  }
}

/** A tool call that errored: the chain is over. */
export function smash(run: ComboRun, kind: ComboKind, by: string): ComboRun {
  return {
    ...run,
    combo: 0,
    breaks: run.combo > 0 ? run.breaks + 1 : run.breaks,
    trail: [],
    broken: run.combo > 0 ? { combo: run.combo, by } : run.broken,
    testsRed: kind === 'test' ? true : run.testsRed,
    turnClean: false,
  }
}

/** A call refused before it ran (a permission denial): blocked, not broken. */
export function parry(run: ComboRun): ComboRun {
  return { ...run, parries: run.parries + 1 }
}

export function startTurn(run: ComboRun): ComboRun {
  return { ...run, turnHits: 0, turnClean: true }
}

/** A clean turn with enough hits is a perfect round, worth a bonus. */
export function perfectBonus(run: ComboRun): number {
  return run.turnClean && run.turnHits >= PERFECT_TURN_AT ? run.turnHits * 10 : 0
}

export function award(run: ComboRun, bonus: number): ComboRun {
  return { ...run, score: run.score + bonus }
}

export function shouldToastBreak(combo: number): boolean {
  return combo >= BREAK_TOAST_AT
}

export function mergeBest(best: ComboBest, run: ComboRun, at: string): ComboBest {
  const isBetter = run.maxCombo > best.combo || run.score > best.score
  return isBetter
    ? { combo: Math.max(best.combo, run.maxCombo), score: Math.max(best.score, run.score), at }
    : best
}

/** A short name for what a call hit: the file's basename or the command's head. */
export function targetOf(input: Readonly<Record<string, unknown>>): string {
  const path = [input.file_path, input.notebook_path, input.path].find(
    (value): value is string => typeof value === 'string',
  )
  if (path !== undefined) return path.split('/').pop() ?? path
  for (const key of ['command', 'pattern', 'query', 'url', 'description'] as const) {
    const value = input[key]
    if (typeof value === 'string') return clip(value.trim().split('\n')[0] ?? '', 32)
  }
  return ''
}

export function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

export function bar(filled: number, width: number): string {
  const cells = Math.max(0, Math.min(width, Math.round(filled * width)))
  return '█'.repeat(cells) + '░'.repeat(width - cells)
}

export function formatScore(score: number): string {
  // No Intl assumption in the hooks environment: group the digits by hand.
  return String(Math.trunc(score)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Progress from the current rank's threshold to the next one, 0 to 1. */
export function progressOf(combo: number): number {
  const next = nextRankOf(combo)
  if (next === null) return 1
  const floor = rankOf(combo)?.at ?? 0
  return (combo - floor) / (next.at - floor)
}
