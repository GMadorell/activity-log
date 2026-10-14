# Activity Log

PWA (Vite + React 19 + TS strict) in `app/`, Cloudflare Worker for GitHub App token exchange in `auth/`. User-facing overview, file format and deploy: [README.md](README.md).

## Secrets and personal data (read before any commit, push, screenshot or publish)

This repo, its CI logs, the built site and the README screenshots are **public**. The owner's data is private.

Never commit, publish, print in CI or paste into issues/PRs:
- **Secrets:** GitHub App client secret or private keys (`.pem`), tokens (`gh*_`, `github_pat_`), `.env*`, `.dev.vars`, Cloudflare credentials. The client secret exists only as a Worker secret (`wrangler secret put`), entered by the owner, never passed through chat or files.
- **Personal data:** real log entries or phrases from them, real places, injury/illness dates, names, email (commits use the GitHub noreply address), local paths, LAN IPs, account IDs.
- **Real data sources:** the private data repo, `app/mock/*.local.md`, `.dev/`, the legacy importer (`app/scripts/legacy*.ts`, `import-legacy.ts`). All gitignored here.

Use mock data instead: fixtures in `app/e2e/fake.ts` and tests use invented places ("Downtown", "Main Gym") and injuries; `app/mock/seed.md` is synthetic. Screenshots come from a clean clone with no `log.local.md`, and every image is checked before committing.

Public by design (fine to commit): GitHub App client ID and slug, Worker URL, data repo name, Pages URL.

Enforced by `scripts/check-public.mjs`, which runs in CI and as a pre-commit hook. After cloning, run `git config core.hooksPath .githooks`. It scans for secret patterns, emails, home paths and private IPs, plus owner-specific terms from the gitignored `.dev/private-terms.txt`; add new private terms there, never in the repo. If it flags something, remove the data. Don't weaken the check. Never rewrite history or force-push without asking.

## Rules

- Bug fixes: write the failing test first (e2e > unit), confirm it fails, then fix.
- Never break parsing of existing `log.md` files. Unparseable lines must survive as text. Format changes need round-trip tests in `app/src/format/format.test.ts`.

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
- README screenshots: run `dev:mock` from a clean clone (no `log.local.md`, so only `mock/seed.md`), capture in dark mode at 412×860 @2x, check every image for personal data before committing (see the secrets and personal data section above).
