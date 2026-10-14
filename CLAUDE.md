# Activity Log

PWA (Vite + React 19 + TS strict) in `app/`, Cloudflare Worker for GitHub App token exchange in `auth/`. User-facing overview, file format and deploy: [README.md](README.md).

## Rules

- **Public repo. Never commit or publish the owner's personal data**: real log entries, real locations, injury/illness dates, local paths, email. Fixtures, seed and screenshots use mock data only. Scan the diff before committing.
- Real data lives only in the private data repo and in gitignored local files (`app/mock/*.local.md`, `.dev/`, the legacy importer in `app/scripts/legacy*.ts`).
- Bug fixes: write the failing test first (e2e > unit), confirm it fails, then fix.
- Never break parsing of existing `log.md` files. Unparseable lines must survive as text. Format changes need round-trip tests in `app/src/format/format.test.ts`.
- The client secret exists only as a Worker secret. Everything in the Pages build is public.

## Commands (in `app/`)

```sh
npm run dev:mock     # local app, fake GitHub in localStorage; --host for phone on LAN
npm test             # vitest
npm run e2e          # playwright, Pixel 7, GitHub + worker mocked via page.route (e2e/fake.ts)
npm run typecheck && npm run lint && npm run format:check
npm run build        # also runs scripts/check-build.mjs: fails if mock code/data reach dist
```

`auth/`: `npx vitest run`, `npx tsc --noEmit`, deploy with `npx wrangler deploy` (manual).

## Map

- `src/format/`: `log.md` grammar (parse/serialize). `src/model/ops.ts`: offline op queue replayed onto the latest remote file (conflict-safe). `src/model/draft.ts`: in-progress session (`phase: 'plan' | 'work'`).
- `src/store/store.ts`: state via `useSyncExternalStore`, persisted under `actlog.*` localStorage keys.
- `src/github/`: `auth.ts` (PKCE, refresh single-flight), `repo.ts` (Contents API), `mock.ts` (mock mode only).
- `src/screens/`: Home, NewSession (start workout picker), Workout (plan + work modes), History, Progress, Injuries, Settings.

## Gotchas

- Mock mode must be dead-code-eliminated: test `import.meta.env.VITE_MOCK === '1'` inline at each use site, never via a config object. `npm run build` enforces it.
- `useEffect(() => el.scrollIntoView(...))` breaks in Chrome (it may return a Promise, which React calls as cleanup). Use a block body.
- README screenshots: run `dev:mock` from a clean clone (no `log.local.md`, so only `mock/seed.md`), capture at 412×860 @2x, check every image for personal data before committing.
