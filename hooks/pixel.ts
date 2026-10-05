// Arcade art for the terminal: a 3x5 pixel font drawn with half blocks, so
// five pixel rows fit in three terminal rows, and a heat-gradient meter.
// Both encode straight to a Raster's cells, never a Box per cell.

const DEFAULT_COLOR = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const FULL = 0x2588 // █
const SPACE = 0x20
const TRACK = 0x2591 // ░

export const TRACK_COLOR = 0x3a3f4b

// Each glyph: five rows of three pixels, '#' lit.
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  x: ['...', '#.#', '.#.', '#.#', '...'],
}

const GLYPH_ROWS = 5
const CELL_ROWS = 3

/** A rank's color pair: where its gradient starts and where it ends. */
export type Heat = readonly [number, number]

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function mix(from: number, to: number, t: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * t) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

function encode(words: readonly number[]): string {
  const bytes = new Uint8Array(new Uint32Array(words).buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export type Cells = { cells: string; columns: number; rows: number }

/** `text` (digits and `x`) as big pixel type, shaded left to right across `heat`. */
export function bigText(text: string, heat: Heat): Cells {
  const glyphs = [...text].map(char => GLYPHS[char] ?? GLYPHS['0'] ?? [])
  const columns = Math.max(1, glyphs.length * 4 - 1)
  const lit = (x: number, y: number): boolean => {
    if (y >= GLYPH_ROWS) return false
    const glyph = glyphs[Math.floor(x / 4)]
    const column = x % 4
    return column < 3 && glyph?.[y]?.[column] === '#'
  }

  const words: number[] = []
  for (let row = 0; row < CELL_ROWS; row += 1) {
    for (let x = 0; x < columns; x += 1) {
      const top = lit(x, row * 2)
      const bottom = lit(x, row * 2 + 1)
      const glyph = top && bottom ? FULL : top ? UPPER : bottom ? LOWER : SPACE
      const color = mix(heat[0], heat[1], columns === 1 ? 1 : x / (columns - 1))
      words.push(glyph, glyph === SPACE ? DEFAULT_COLOR : color, DEFAULT_COLOR)
    }
  }
  return { cells: encode(words), columns, rows: CELL_ROWS }
}

/** A one-row meter: `filled` of `columns` lit along the heat gradient, the rest a dim track. */
export function heatBar(filled: number, columns: number, heat: Heat): Cells {
  const lit = Math.max(0, Math.min(columns, Math.round(filled * columns)))
  const words: number[] = []
  for (let x = 0; x < columns; x += 1) {
    if (x < lit) {
      words.push(FULL, mix(heat[0], heat[1], columns === 1 ? 1 : x / (columns - 1)), DEFAULT_COLOR)
    } else {
      words.push(TRACK, TRACK_COLOR, DEFAULT_COLOR)
    }
  }
  return { cells: encode(words), columns, rows: 1 }
}
