import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatSets, serializeSession } from '../format/serialize'
import type { SetEntry } from '../format/types'
import { clock, formatDay } from '../lib/display'
import { exerciseNamesOf } from '../lib/stats'
import {
  blockDone,
  blockName,
  blockPlanned,
  draftIsEmpty,
  draftToSession,
  planFor,
  setFromTarget,
  type Draft,
  type DraftBlock,
  type DraftExercise,
  measureOf,
  withMeasure,
  type Measure,
  type Target,
} from '../model/draft'
import { assertRoundTrips } from '../model/ops'
import { commit, setDraft, updateDraft, useStore } from '../store/store'
import { TargetTiles } from '../ui/controls'
import { useElapsed, useWakeLock } from '../ui/hooks'
import { navigate } from '../ui/router'

type Group = Extract<DraftBlock, { kind: 'group' }>

/** Immutable update helper: mutate a deep copy. */
const edit = (fn: (d: Draft) => void) =>
  updateDraft((d) => {
    const copy = structuredClone(d)
    fn(copy)
    return copy
  })

/** "9", "5@65", "60s@30ea": one set without the "1x". */
const setLabel = (s: SetEntry) => formatSets([s]).replace(/^1x/, '')

/** Next block with sets left, wrapping; stays put if all done. */
function nextActive(d: Draft, from: number): number {
  for (let k = 1; k <= d.blocks.length; k++) {
    const i = (from + k) % d.blocks.length
    if (blockDone(d.blocks[i]) < blockPlanned(d.blocks[i])) return i
  }
  return from
}

function upNext(d: Draft): DraftBlock | undefined {
  const i = nextActive(d, d.active)
  return i === d.active ? undefined : d.blocks[i]
}

function targetSummary(b: DraftBlock): string {
  if (b.kind === 'group') return `${b.plannedRounds} rounds`
  return `${b.plannedSets}×${setLabel(setFromTarget(b.target))}`
}

function DoneSets({ sets }: { sets: SetEntry[] }) {
  return (
    <div className="sets" aria-label="Completed sets">
      <span className="muted small" style={{ background: 'none', padding: 0, fontWeight: 400 }}>
        Done:
      </span>
      {sets.length === 0 && (
        <span className="muted small" style={{ background: 'none', padding: 0, fontWeight: 400 }}>
          –
        </span>
      )}
      {sets.map((s, i) => (
        <span key={i}>{setLabel(s)}</span>
      ))}
    </div>
  )
}

/** Finished sets (or rounds) over planned; −/+ change the plan. */
function Counter({
  label,
  done,
  planned,
  onPlanned,
}: {
  label: string
  done: number
  planned: number
  onPlanned: (n: number) => void
}) {
  return (
    <div className="row" style={{ gap: 0 }}>
      <button
        className="btn ghost icon"
        aria-label={`Fewer ${label}s`}
        onClick={() => onPlanned(Math.max(1, planned - 1))}
      >
        −
      </button>
      <div className="counter">
        <span className="eyebrow">{label}s done</span>
        <span className="display" aria-label={`${label[0].toUpperCase()}${label.slice(1)}s done`}>
          {done}/{planned}
        </span>
      </div>
      <button className="btn ghost icon" aria-label={`More ${label}s`} onClick={() => onPlanned(planned + 1)}>
        +
      </button>
    </div>
  )
}

/** Plain −/+ stepper for planned sets or rounds. */
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="row between">
      <span className="eyebrow">{label}s</span>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn icon" aria-label={`Fewer ${label}s`} onClick={() => onChange(Math.max(1, value - 1))}>
          −
        </button>
        <span className="display" style={{ fontSize: '1.6rem', minWidth: '2ch', textAlign: 'center' }}>
          {value}
        </span>
        <button className="btn icon" aria-label={`More ${label}s`} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  )
}

function MeasureSeg({ name, target, onChange }: { name: string; target: Target; onChange: (t: Target) => void }) {
  return (
    <div className="seg" role="group" aria-label={`${name} measured in`}>
      {(
        [
          ['reps', 'Reps'],
          ['secs', 'Time'],
          ['meters', 'Distance'],
        ] as [Measure, string][]
      ).map(([m, label]) => (
        <button key={m} aria-pressed={measureOf(target) === m} onClick={() => onChange(withMeasure(target, m))}>
          {label}
        </button>
      ))}
    </div>
  )
}

function ExerciseFocus({ block, index, rest }: { block: DraftExercise; index: number; rest: ReactNode }) {
  const ex = (d: Draft) => d.blocks[index] as DraftExercise
  return (
    <>
      <div className="row between wrap">
        <h1 className="grow" style={{ fontSize: '2.6rem' }}>
          {block.name}
        </h1>
        <Counter
          label="set"
          done={block.done.length}
          planned={block.plannedSets}
          onPlanned={(n) => edit((d) => void (ex(d).plannedSets = n))}
        />
      </div>
      {rest}
      <TargetTiles target={block.target} onChange={(t) => edit((d) => void (ex(d).target = t))} />
      <DoneSets sets={block.done} />
    </>
  )
}

function GroupFocus({ block, index, rest }: { block: Group; index: number; rest: ReactNode }) {
  const g = (d: Draft) => d.blocks[index] as Group
  return (
    <>
      <div className="row between wrap">
        <h1 className="grow" style={{ fontSize: '2.6rem' }}>
          {block.label}
        </h1>
        <Counter
          label="round"
          done={blockDone(block)}
          planned={block.plannedRounds}
          onPlanned={(n) => edit((d) => void (g(d).plannedRounds = n))}
        />
      </div>
      {rest}
      {block.exercises.map((e, i) => (
        <section key={i} className="stack" style={{ gap: 8 }}>
          <div className="row between">
            <h2 className="grow">{e.name}</h2>
            <span className="secondary small">{e.done.length ? `done ${e.done.map(setLabel).join(' ')}` : ''}</span>
          </div>
          <TargetTiles target={e.target} onChange={(t) => edit((d) => void (g(d).exercises[i].target = t))} />
        </section>
      ))}
    </>
  )
}

function AddForm({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <form
      className="row"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (!name.trim()) return
        onAdd(name.trim())
        setName('')
      }}
    >
      <input
        className="grow"
        list="exercise-names"
        aria-label={label}
        placeholder={`${label}…`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn">Add</button>
    </form>
  )
}

/** Editor for the expanded block in the plan. */
function BlockEditor({ block, index, onRemoved }: { block: DraftBlock; index: number; onRemoved: () => void }) {
  const { doc } = useStore()
  const done = blockDone(block)
  const remove = () => {
    if (done && !confirm(`Remove ${blockName(block)} and its ${done} logged sets?`)) return
    edit((d) => {
      d.blocks.splice(index, 1)
      d.active = Math.min(d.active > index ? d.active - 1 : d.active, Math.max(0, d.blocks.length - 1))
    })
    onRemoved()
  }
  if (block.kind === 'exercise') {
    const ex = (d: Draft) => d.blocks[index] as DraftExercise
    return (
      <section className="card stack" aria-label={`Edit ${block.name}`}>
        <h2>{block.name}</h2>
        <Stepper label="set" value={block.plannedSets} onChange={(n) => edit((d) => void (ex(d).plannedSets = n))} />
        <MeasureSeg name={block.name} target={block.target} onChange={(t) => edit((d) => void (ex(d).target = t))} />
        <TargetTiles target={block.target} onChange={(t) => edit((d) => void (ex(d).target = t))} />
        <button className="btn ghost danger" onClick={remove}>
          Remove {block.name}
        </button>
      </section>
    )
  }
  const g = (d: Draft) => d.blocks[index] as Group
  return (
    <section className="card stack" aria-label={`Edit ${block.label}`}>
      <h2>{block.label}</h2>
      <Stepper label="round" value={block.plannedRounds} onChange={(n) => edit((d) => void (g(d).plannedRounds = n))} />
      {block.exercises.map((e, i) => (
        <section key={i} className="stack" style={{ gap: 8 }}>
          <div className="row between">
            <h2 className="grow">{e.name}</h2>
            <button
              className="btn ghost icon"
              aria-label={`Remove ${e.name}`}
              onClick={() => edit((d) => void g(d).exercises.splice(i, 1))}
            >
              ✕
            </button>
          </div>
          <MeasureSeg
            name={e.name}
            target={e.target}
            onChange={(t) => edit((d) => void (g(d).exercises[i].target = t))}
          />
          <TargetTiles target={e.target} onChange={(t) => edit((d) => void (g(d).exercises[i].target = t))} />
        </section>
      ))}
      <AddForm
        label={`Add to ${block.label.toLowerCase()}`}
        onAdd={(name) => edit((d) => void g(d).exercises.push(planFor(doc.sessions, name)))}
      />
      <button className="btn ghost danger" onClick={remove}>
        Remove {block.label.toLowerCase()}
      </button>
    </section>
  )
}

/** Planning mode: define exercises and targets. No stopwatch here. */
function Plan({ draft, onFinish }: { draft: Draft; onFinish: () => void }) {
  const { doc } = useStore()
  const started = draft.blocks.some(blockDone)
  // Block shown in the editor, none at first. Tapping one also makes it the one to work on; adding one doesn't.
  const [editing, setEditing] = useState(-1)
  const editor = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Block body: scrollIntoView may return a Promise, which isn't a valid effect cleanup.
    editor.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editing])
  const selected = draft.blocks[editing]
  const addBlock = (block: DraftBlock) => {
    setEditing(draft.blocks.length)
    edit((d) => void d.blocks.push(block))
  }
  const start = () =>
    edit((d) => {
      d.phase = 'work'
      if (blockDone(d.blocks[d.active]) >= blockPlanned(d.blocks[d.active])) d.active = nextActive(d, d.active)
    })
  return (
    <>
      <header className="topbar">
        <MinimizeLink />
        <h1 className="grow">Plan</h1>
        {started ? (
          <button className="btn soft" onClick={onFinish}>
            Finish
          </button>
        ) : (
          <button
            className="btn ghost danger"
            onClick={() => {
              if (!draft.blocks.length || confirm('Discard this plan?')) {
                setDraft(null)
                navigate('')
              }
            }}
          >
            Discard
          </button>
        )}
      </header>
      <DateLine draft={draft} />
      <section className="stack" aria-label="Exercises">
        <h2>Exercises</h2>
        {draft.blocks.length === 0 && <p className="muted">Add an exercise or a superset to get started.</p>}
        <div className="blocks">
          {draft.blocks.map((b, i) => {
            const done = blockDone(b)
            const planned = blockPlanned(b)
            return (
              <button
                key={i}
                className={`block${done >= planned ? ' done' : ''}`}
                aria-pressed={i === editing}
                onClick={() => {
                  if (i === editing) return setEditing(-1)
                  setEditing(i)
                  edit((d) => void (d.active = i))
                }}
              >
                <span className="name grow">
                  {blockName(b)}
                  <br />
                  <span className="muted small">{targetSummary(b)}</span>
                </span>
                {started && (
                  <span className="progress">
                    {done}/{planned}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <AddForm
          label="Add exercise"
          onAdd={(name) => addBlock({ kind: 'exercise', ...planFor(doc.sessions, name) })}
        />
        <button
          className="btn"
          onClick={() => addBlock({ kind: 'group', label: 'Superset', plannedRounds: 3, exercises: [] })}
        >
          Add superset / circuit
        </button>
      </section>
      {selected && (
        <div ref={editor} style={{ scrollMarginBottom: 110 }}>
          <BlockEditor key={editing} block={selected} index={editing} onRemoved={() => setEditing(-1)} />
        </div>
      )}
      <div className="spacer" />
      <button className="btn primary big sticky-action" disabled={!draft.blocks.length} onClick={start}>
        {started ? 'Back to workout' : 'Start workout'}
      </button>
    </>
  )
}

function MinimizeLink() {
  return (
    <a className="btn ghost icon" href="#/" aria-label="Minimize to home">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </a>
  )
}

function DateLine({ draft }: { draft: Draft }) {
  return (
    <div className="muted small center" style={{ marginTop: -8 }}>
      {formatDay(draft.date)}
      {draft.location ? ` · ${draft.location}` : ''}
    </div>
  )
}

function FinishSheet({ draft, onBack }: { draft: Draft; onBack: () => void }) {
  const session = draftToSession(draft)
  const [error, setError] = useState<string>()
  const empty = draftIsEmpty(draft)
  const save = () => {
    try {
      assertRoundTrips(session)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    setDraft(null)
    void commit({ type: 'addSession', session })
    navigate('')
  }
  return (
    <>
      <header className="topbar">
        <h1>Finish</h1>
        <button className="btn soft" onClick={onBack}>
          Back
        </button>
      </header>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea
          value={draft.text}
          onChange={(e) => edit((d) => void (d.text = e.target.value))}
          placeholder="How did it feel?"
        />
      </label>
      <div className="card">
        <pre className="mono small">{empty ? 'Nothing logged yet.' : serializeSession(session)}</pre>
      </div>
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      <button className="btn primary big" disabled={empty} onClick={save}>
        Save session
      </button>
      <button
        className="btn danger"
        onClick={() => {
          if (empty || confirm('Discard this session? Logged sets will be lost.')) {
            setDraft(null)
            navigate('')
          }
        }}
      >
        Discard session
      </button>
    </>
  )
}

export function Workout() {
  const { draft, doc } = useStore()
  const [finishing, setFinishing] = useState(false)
  const names = useMemo(() => exerciseNamesOf(doc.sessions), [doc.sessions])
  useWakeLock()
  const elapsed = useElapsed(draft?.lastSetAt)

  if (!draft) {
    return (
      <div className="stack">
        <p>No session in progress.</p>
        <a className="btn primary big" href="#/new">
          Start workout
        </a>
      </div>
    )
  }

  if (finishing) return <FinishSheet draft={draft} onBack={() => setFinishing(false)} />

  const active = draft.blocks[draft.active]
  const datalist = (
    <datalist id="exercise-names">
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  )

  if (draft.phase !== 'work' || !active) {
    return (
      <>
        {datalist}
        <Plan draft={draft} onFinish={() => setFinishing(true)} />
      </>
    )
  }

  const next = upNext(draft)
  const rest = (
    <section className="card rest" aria-label="Rest">
      <div className="eyebrow">{elapsed === null ? 'Rest timer starts after your first set' : 'Rest'}</div>
      <div className="stopwatch" role="timer">
        {elapsed === null ? '0:00' : clock(elapsed)}
      </div>
    </section>
  )

  const setDone = () => {
    navigator.vibrate?.(40)
    edit((d) => {
      const b = d.blocks[d.active]
      if (b.kind === 'exercise') b.done.push(setFromTarget(b.target))
      else for (const e of b.exercises) e.done.push(setFromTarget(e.target))
      d.lastSetAt = Date.now()
      if (blockDone(b) >= blockPlanned(b)) d.active = nextActive(d, d.active)
    })
  }

  // Every planned set is done: the big button finishes instead of logging sets forever.
  const allDone = draft.blocks.every((b) => blockDone(b) >= blockPlanned(b))
  const extraSet = () => {
    edit((d) => {
      const b = d.blocks[d.active]
      if (b.kind === 'exercise') b.plannedSets = Math.max(b.plannedSets, b.done.length) + 1
      else b.plannedRounds = Math.max(b.plannedRounds, blockDone(b)) + 1
    })
    setDone()
  }

  const undo = () =>
    edit((d) => {
      const b = d.blocks[d.active]
      if (b.kind === 'exercise') b.done.pop()
      else {
        const round = blockDone(b)
        for (const e of b.exercises) if (e.done.length === round) e.done.pop()
      }
    })

  return (
    <>
      <header className="topbar">
        <MinimizeLink />
        <div className="segments grow" aria-hidden="true">
          {draft.blocks.map((b, i) => (
            <i key={i} className={blockDone(b) >= blockPlanned(b) || i === draft.active ? 'on' : ''} />
          ))}
        </div>
        <button className="btn soft" onClick={() => setFinishing(true)}>
          Finish
        </button>
      </header>
      <DateLine draft={draft} />

      {active.kind === 'exercise' ? (
        <ExerciseFocus block={active} index={draft.active} rest={rest} />
      ) : (
        <GroupFocus block={active} index={draft.active} rest={rest} />
      )}

      <div className="spacer" />
      <div className="row between">
        <button className="btn soft" onClick={() => edit((d) => void (d.phase = 'plan'))}>
          Plan
        </button>
        <span className="muted small grow center">
          {allDone ? 'All planned sets done' : next ? `Up next: ${blockName(next)}` : ''}
        </span>
        <button className="btn soft" onClick={undo} disabled={blockDone(active) === 0}>
          Undo
        </button>
      </div>
      {allDone ? (
        <>
          <button className="btn" onClick={extraSet}>
            Extra set
          </button>
          <button className="btn primary done-btn" onClick={() => setFinishing(true)}>
            Finish workout
          </button>
        </>
      ) : (
        <button
          className="btn primary done-btn"
          onClick={setDone}
          disabled={active.kind === 'group' && !active.exercises.length}
        >
          {active.kind === 'group' ? 'Round done' : 'Set done'}
        </button>
      )}
    </>
  )
}
