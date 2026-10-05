import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ComboBest, ComboRun } from '../types'
import {
  EMPTY_BEST,
  EMPTY_RUN,
  WARMUP_HEAT,
  award,
  bar,
  clip,
  formatScore,
  kindOf,
  land,
  mergeBest,
  multiplierOf,
  nextRankOf,
  parry,
  perfectBonus,
  progressOf,
  rankOf,
  shouldToastBreak,
  smash,
  startTurn,
  targetOf,
} from './combo'
import { TRACK_COLOR, bigText, heatBar, hex } from './pixel'

const run = atom({ plugin: 'combo-meter', key: 'run' } as const, EMPTY_RUN)
const best = atom({ plugin: 'combo-meter', key: 'best' } as const, EMPTY_BEST)

const STORE_BEST = 'best'
const COMMAND = 'combo'
const METER_MAX = 28
const METER_MIN = 10
/** Below this many columns the big counter does not fit beside the meter. */
const BIG_MIN_COLUMNS = 56

const SFX = {
  rankup: 'sfx/rankup.wav',
  special: 'sfx/special.wav',
  break: 'sfx/break.wav',
  record: 'sfx/record.wav',
  perfect: 'sfx/perfect.wav',
} as const

type Sfx = keyof typeof SFX

function statusOf(current: ComboRun): string | undefined {
  if (current.combo === 0) {
    return current.broken === null ? undefined : `✖ combo x${current.broken.combo} broken`
  }
  const rank = rankOf(current.combo)
  const label = rank === null ? '' : ` ${rank.letter}`
  return `⚡ x${current.combo}${label} · ${formatScore(current.score)} pts`
}

function readBest(stored: unknown): ComboBest {
  if (typeof stored !== 'object' || stored === null) return EMPTY_BEST
  const held: Readonly<Record<string, unknown>> = { ...stored }
  return {
    combo: typeof held.combo === 'number' ? held.combo : 0,
    score: typeof held.score === 'number' ? held.score : 0,
    at: typeof held.at === 'string' ? held.at : null,
  }
}

// Effects are a flourish: a clip that cannot play (no player on this
// system) must never cost the hook that triggered it.
function play($: EngineInterface, sfx: Sfx, isOn: boolean): void {
  if (!isOn) return
  $.audio.play({ asset: SFX[sfx] }).catch(() => undefined)
}

async function saveBest($: EngineInterface): Promise<void> {
  const current = await read($, run)
  const at = new Date(await $.clock.now()).toISOString()
  const merged = await update($, best, held => mergeBest(held, current, at))
  await $.store.set(STORE_BEST, merged)
}

export const register: Register = (on, options) => {
  const isSoundOn = options.sound !== false
  const isCompact = options.style === 'compact'

  on('session.start', async ($, e, next) => {
    const kept = readBest(await $.store.get(STORE_BEST))
    await update($, best, () => kept)
    await $.command.register({
      name: COMMAND,
      description: 'Combo Meter: this session’s fight card (`/combo reset-best` clears the all-time record)',
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, run, startTurn)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input: Readonly<Record<string, unknown>> = e
    const tool = String(e.tool)
    const command = typeof input.command === 'string' ? input.command : undefined
    const kind = kindOf(tool, command)
    const target = targetOf(input)

    const ran = await next(e)

    if (ran.deny !== undefined) {
      await update($, run, parry)
      return ran
    }

    if (ran.isError === true) {
      const before = await read($, run)
      const by = clip(target || tool, 32)
      const after = await update($, run, held => smash(held, kind, by))
      if (shouldToastBreak(before.combo)) {
        $.ui.toast(`💥 COMBO BROKEN  x${before.combo} — ${clip(target || tool, 40)}`)
        play($, 'break', isSoundOn)
      }
      $.ui.status(statusOf(after))
      return ran
    }

    const record = await read($, best)
    const after = await update($, run, held => land(held, record, kind, target))
    const hit = after.last
    if (hit !== null) {
      const isNewRecord = record.combo > 0 && hit.combo === record.combo + 1
      if (hit.special !== null) $.ui.toast(`✨ ${hit.special}  +${formatScore(hit.points)}`)
      if (hit.rankUp !== null) $.ui.toast(`▲ RANK ${hit.rankUp}  x${hit.combo}`)
      if (isNewRecord) $.ui.toast(`🏆 NEW RECORD  x${hit.combo} beats x${record.combo}`)
      // One clip per hit, the biggest moment wins.
      if (isNewRecord) play($, 'record', isSoundOn)
      else if (hit.special !== null) play($, 'special', isSoundOn)
      else if (hit.rankUp !== null) play($, 'rankup', isSoundOn)
    }
    $.ui.status(statusOf(after))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const isMainTurn = e.agentId === undefined && !e.isAborted
    if (isMainTurn) {
      const current = await read($, run)
      const bonus = perfectBonus(current)
      if (bonus > 0) {
        const after = await update($, run, held => award(held, bonus))
        $.ui.toast(`🥋 PERFECT TURN  ${current.turnHits} hits, no misses  +${formatScore(bonus)}`)
        $.ui.status(statusOf(after))
        play($, 'perfect', isSoundOn)
      }
      await saveBest($)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await saveBest($)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim() === 'reset-best') {
      await update($, best, () => EMPTY_BEST)
      await $.store.delete(STORE_BEST)
      return { text: 'Combo Meter: all-time record cleared.' }
    }

    const current = await read($, run)
    const record = await read($, best)
    const rank = rankOf(current.maxCombo)
    const lines = [
      '🥊 COMBO METER — fight card',
      '',
      `  Current combo    x${current.combo}`,
      `  Best this fight  x${current.maxCombo}${rank === null ? '' : `  (${rank.letter} ${rank.name})`}`,
      `  Score            ${formatScore(current.score)}`,
      `  Hits / breaks    ${current.hits} / ${current.breaks}`,
      `  Specials landed  ${current.specials}`,
      `  Parried          ${current.parries}`,
      '',
      `  All-time         x${Math.max(record.combo, current.maxCombo)} · ${formatScore(Math.max(record.score, current.score))} pts`,
    ]

    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const current = await read($, run)
    const record = await read($, best)
    const { Box, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns

    if (current.combo === 0) {
      if (current.broken === null) return next(e)
      return (
        <Box flexDirection="row">
          <Text color="#f87171" bold>
            {`✖ K.O.  x${current.broken.combo} chain`}
          </Text>
          <Text dimColor wrap="truncate-end">
            {`  broken by ${current.broken.by} · best x${Math.max(record.combo, current.maxCombo)} · next hit starts a new round`}
          </Text>
        </Box>
      )
    }

    const rank = rankOf(current.combo)
    const upcoming = nextRankOf(current.combo)
    const hit = current.last
    const heat = rank?.heat ?? WARMUP_HEAT
    const accent = hex(heat[1])
    const meterColumns = Math.max(METER_MIN, Math.min(METER_MAX, Math.floor(columns / 3)))
    const progress = progressOf(current.combo)

    const title = (
      <Box flexDirection="row">
        <Text color="#0b0b0f" backgroundColor={accent} bold>
          {` ${rank?.letter ?? '·'} `}
        </Text>
        <Text color={accent} bold>
          {` ${rank?.name ?? 'WARMING UP'}`}
        </Text>
        <Text color="#facc15" bold>{`  ×${multiplierOf(current.combo)}`}</Text>
        <Text dimColor>{`  ${formatScore(current.score)} pts`}</Text>
        {current.isRecord && <Text color="#facc15">{'  🏆 NEW BEST'}</Text>}
      </Box>
    )
    const toNext = (
      <Text dimColor>
        {upcoming === null ? '  MAX RANK' : `  ${upcoming.at - current.combo} to ${upcoming.letter}`}
      </Text>
    )
    const lastHit = hit !== null && (
      <Box flexDirection="row">
        <Text color={hit.special === null ? accent : '#facc15'} bold>
          {hit.special === null ? hit.move : `✦ ${hit.special}`}
        </Text>
        <Text dimColor wrap="truncate-end">
          {`${hit.target === '' ? '' : `  ${hit.target}`}  +${formatScore(hit.points)}`}
        </Text>
      </Box>
    )

    // Off the terminal there is no Raster: the same card, drawn in text.
    if (e.surface !== 'terminal' || isCompact || columns < BIG_MIN_COLUMNS) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text color={accent} bold>{`x${current.combo} `}</Text>
            {title}
          </Box>
          {!isCompact && (
            <Box flexDirection="row">
              <Text color={accent}>{bar(progress, meterColumns)}</Text>
              {toNext}
            </Box>
          )}
        </Box>
      )
    }

    const { Raster } = $.ui.resolve(e)
    const counter = bigText(`x${current.combo}`, heat)
    const meter = heatBar(progress, meterColumns, heat)

    return (
      <Box flexDirection="row">
        <Raster key="counter" columns={counter.columns} rows={counter.rows} cells={counter.cells} />
        <Box flexDirection="column" marginLeft={2}>
          {title}
          <Box flexDirection="row">
            <Raster key="meter" columns={meter.columns} rows={meter.rows} cells={meter.cells} />
            {toNext}
          </Box>
          {lastHit || <Text color={hex(TRACK_COLOR)}>ready</Text>}
        </Box>
      </Box>
    )
  })
}
