/** Public build-time config. None of these are secrets. */
export const config = {
  /** "owner/repo" of the private data repo. */
  dataRepo: import.meta.env.VITE_DATA_REPO ?? 'GMadorell/activity-log-data',
  dataPath: import.meta.env.VITE_DATA_PATH ?? 'log.md',
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? '',
  /** Cloudflare Worker doing the code/refresh exchange. */
  authUrl: import.meta.env.VITE_AUTH_URL ?? '',
  /** GitHub App slug, for the "install on repo" link. */
  appSlug: import.meta.env.VITE_GITHUB_APP_SLUG ?? 'activity-log',
}
