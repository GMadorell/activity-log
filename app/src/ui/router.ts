import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const current = () => location.hash.replace(/^#\/?/, '')

/** Path segments of the hash route, e.g. "#/history/3" -> ["history", "3"]. */
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, current)
  return hash ? hash.split('/').map(decodeURIComponent) : []
}

export const href = (...parts: (string | number)[]) => '#/' + parts.map((p) => encodeURIComponent(String(p))).join('/')

export const navigate = (...parts: (string | number)[]) => {
  location.hash = href(...parts)
}
