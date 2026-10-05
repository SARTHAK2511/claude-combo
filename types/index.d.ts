/** The family of a tool call, which decides its move name and points. */
export type ComboKind =
  | 'read'
  | 'scout'
  | 'edit'
  | 'write'
  | 'bash'
  | 'test'
  | 'commit'
  | 'agent'
  | 'web'
  | 'mcp'
  | 'meta'
  | 'other'

/** One landed hit: the move, what it hit, and the combo it brought you to. */
export type ComboHit = {
  move: string
  target: string
  points: number
  combo: number
  special: string | null
  rankUp: string | null
}

/** The chain that just ended, shown until the next hit lands. */
export type ComboBreak = {
  combo: number
  by: string
}

/** One session's fight. */
export type ComboRun = {
  combo: number
  score: number
  maxCombo: number
  hits: number
  breaks: number
  parries: number
  specials: number
  trail: ComboKind[]
  last: ComboHit | null
  broken: ComboBreak | null
  testsRed: boolean
  turnHits: number
  turnClean: boolean
  isRecord: boolean
}

/** The all-time high score, kept across sessions. */
export type ComboBest = {
  combo: number
  score: number
  at: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'combo-meter': { run: ComboRun; best: ComboBest }
  }
}
