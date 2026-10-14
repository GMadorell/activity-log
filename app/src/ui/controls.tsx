import { useState } from 'react'
import type { Weight, WeightMode } from '../format/types'
import { clock } from '../lib/display'
import type { Target } from '../model/draft'

const round = (v: number) => Math.round(v * 100) / 100

function parseNumberish(s: string, clockFormat: boolean): number | undefined {
  const m = /^(\d+):(\d{1,2})$/.exec(s.trim())
  if (clockFormat && m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(s.trim().replace(',', '.'))
  return s.trim() && Number.isFinite(n) ? n : undefined
}

/** Big value tile with −/+; the value is also typeable. */
export function Tile({
  label,
  value,
  display,
  step,
  min = 0,
  clockFormat = false,
  unit,
  onChange,
}: {
  label: string
  value: number
  /** Shown instead of the number (e.g. "BW"). */
  display?: string
  step: number
  min?: number
  clockFormat?: boolean
  unit?: { text: string; onClick?: () => void; title?: string }
  onChange: (v: number) => void
}) {
  const shown = display ?? (clockFormat ? clock(value) : String(value))
  // Non-null only while typing.
  const [text, setText] = useState<string | null>(null)
  const commitText = () => {
    if (text === null) return
    const parsed = parseNumberish(text, clockFormat)
    if (parsed !== undefined && parsed >= min) onChange(round(parsed))
    setText(null)
  }
  return (
    <div className="tile">
      <span className="eyebrow">{label}</span>
      <input
        className="value"
        aria-label={label}
        inputMode="decimal"
        value={text ?? shown}
        onFocus={(e) => {
          setText(display ? '' : shown)
          e.target.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {unit &&
        (unit.onClick ? (
          <button className="unit" onClick={unit.onClick} title={unit.title}>
            {unit.text} ▾
          </button>
        ) : (
          <span className="unit">{unit.text}</span>
        ))}
      <div className="pm">
        <button
          className="btn"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(round(Math.max(min, value - step)))}
        >
          −
        </button>
        <button className="btn" aria-label={`Increase ${label}`} onClick={() => onChange(round(value + step))}>
          +
        </button>
      </div>
    </div>
  )
}

const MODE_ORDER: (WeightMode | 'bw')[] = ['bw', 'total', 'each', 'added']
const MODE_LABEL: Record<WeightMode | 'bw', string> = {
  bw: 'bodyweight',
  total: 'kg',
  each: 'kg each',
  added: 'kg added',
}

export function LoadTile({ weight, onChange }: { weight?: Weight; onChange: (w: Weight | undefined) => void }) {
  const mode = weight?.mode ?? 'bw'
  const cycle = () => {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]
    onChange(next === 'bw' ? undefined : { value: weight?.value || 20, mode: next })
  }
  return (
    <Tile
      label="Load"
      value={weight?.value ?? 0}
      display={weight ? undefined : 'BW'}
      step={2.5}
      unit={{ text: MODE_LABEL[mode], onClick: cycle, title: 'Change load type' }}
      onChange={(value) =>
        // From bodyweight, "+" means adding weight (weighted pull-ups, dips).
        onChange(value <= 0 ? undefined : { value, mode: weight?.mode ?? 'added' })
      }
    />
  )
}

/** Reps / time / distance tile(s) + load tile for one exercise target. */
export function TargetTiles({ target, onChange }: { target: Target; onChange: (t: Target) => void }) {
  if (target.meters !== undefined) {
    return (
      <div className="tiles">
        <Tile
          label="Distance"
          unit={{ text: 'meters' }}
          value={target.meters}
          step={100}
          onChange={(meters) => onChange({ ...target, meters })}
        />
        <Tile
          label="Time"
          unit={{ text: 'm:ss' }}
          value={target.secs ?? 0}
          step={5}
          clockFormat
          onChange={(secs) => onChange({ ...target, secs })}
        />
      </div>
    )
  }
  return (
    <div className="tiles">
      {target.secs !== undefined ? (
        <Tile
          label="Time"
          unit={{ text: 'seconds' }}
          value={target.secs}
          step={5}
          onChange={(secs) => onChange({ ...target, secs })}
        />
      ) : (
        <Tile
          label="Reps"
          unit={{ text: 'reps' }}
          value={target.reps ?? 0}
          step={1}
          onChange={(reps) => onChange({ ...target, reps })}
        />
      )}
      <LoadTile weight={target.weight} onChange={(weight) => onChange({ ...target, weight })} />
    </div>
  )
}
