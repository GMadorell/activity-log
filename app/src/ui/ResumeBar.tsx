import { clock } from '../lib/display'
import { blockDone } from '../model/draft'
import { useStore } from '../store/store'
import { useElapsed } from './hooks'
import { href } from './router'

/** Sticky link back to the unfinished session, so it's never lost while browsing other tabs. */
export function ResumeBar() {
  const { draft } = useStore()
  const elapsed = useElapsed(draft?.lastSetAt)
  if (!draft) return null
  if (draft.kind === 'activity') {
    return (
      <a className="resume-bar" href={href('new', 'activity')}>
        <span className="grow">Resume activity</span>›
      </a>
    )
  }
  const sets = draft.blocks.reduce((n, b) => n + blockDone(b), 0)
  return (
    <a className="resume-bar" href={href('workout')}>
      <span className="grow">{draft.phase === 'plan' && !sets ? 'Resume planning' : 'Resume workout'}</span>
      {sets > 0 && <span className="small">{sets === 1 ? '1 set' : `${sets} sets`}</span>}
      {elapsed !== null && <span className="time">{clock(elapsed)}</span>}›
    </a>
  )
}
