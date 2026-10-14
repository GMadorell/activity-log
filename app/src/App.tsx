import { useEffect, type ReactNode } from 'react'
import { History } from './screens/History'
import { Home } from './screens/Home'
import { Injuries } from './screens/Injuries'
import { NewSession } from './screens/NewSession'
import { Progress } from './screens/Progress'
import { Settings } from './screens/Settings'
import { SignIn } from './screens/SignIn'
import { Workout } from './screens/Workout'
import { flush, refresh, useStore } from './store/store'
import { ResumeBar } from './ui/ResumeBar'
import { href, useRoute } from './ui/router'

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  history: <path d="M4 6h16M4 12h16M4 18h10" />,
  progress: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  injuries: (
    <path d="M12 21s-7-4.5-9-9.5C1.6 7.6 4.5 4 8 4c2 0 3.2 1 4 2.3C12.8 5 14 4 16 4c3.5 0 6.4 3.6 5 7.5-2 5-9 9.5-9 9.5z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
}

const TABS: [string, string][] = [
  ['', 'Home'],
  ['history', 'History'],
  ['progress', 'Progress'],
  ['injuries', 'Injuries'],
  ['settings', 'Settings'],
]

function Nav({ active }: { active: string }) {
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map(([path, label]) => (
        <a key={path} href={href(path)} aria-current={active === path ? 'page' : undefined}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[path || 'home']}
          </svg>
          {label}
        </a>
      ))}
    </nav>
  )
}

export default function App({ loginError }: { loginError?: string }) {
  const { signedIn, draft } = useStore()
  const route = useRoute()
  const [page = '', arg] = route

  useEffect(() => {
    if (!signedIn) return
    void refresh()
    const onOnline = () => void flush()
    // Pick up edits made elsewhere (other device, GitHub web) when coming back.
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn])

  if (!signedIn) return <SignIn error={loginError} />

  let screen: ReactNode
  switch (page) {
    case 'new':
      screen = <NewSession mode={arg} />
      break
    case 'workout':
      screen = <Workout />
      break
    case 'history':
      screen = <History index={arg === undefined ? undefined : arg === 'new' ? 'new' : Number(arg)} />
      break
    case 'progress':
      screen = <Progress name={arg} />
      break
    case 'injuries':
      screen = <Injuries />
      break
    case 'settings':
      screen = <Settings />
      break
    default:
      screen = <Home />
  }

  // Home has its own resume card; the session's own screen needs none.
  const showResume = !!draft && page !== '' && page !== 'workout' && !(page === 'new' && draft.kind === 'activity')

  return (
    <>
      <main className={page === 'workout' ? 'app focus' : 'app'}>
        {showResume && <ResumeBar />}
        {screen}
      </main>
      {page !== 'workout' && <Nav active={page} />}
    </>
  )
}
