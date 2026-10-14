#!/usr/bin/env node
// Fails if tracked (or staged) files contain secrets or personal details.
// Generic patterns always apply. Owner-specific terms (real places, names...)
// are read from the gitignored .dev/private-terms.txt when present, so the
// denylist itself is never published.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const staged = process.argv.includes('--staged')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const files = (staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR') : git('ls-files'))
  .split('\n')
  .filter(Boolean)

const FORBIDDEN_FILES = [/\.pem$/, /\.key$/, /(^|\/)\.env(\.|$)(?!example)/, /\.dev\.vars$/, /\.local\.md$/, /^\.dev\//]
const PATTERNS = [
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['API key', /\b(sk-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,})/],
  ['secret assignment', /(client_secret|api_key|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i],
  ['home path', /\/(Users|home)\/[a-z][\w.-]+\//],
  ['email', /\b[\w.+-]+@(?!users\.noreply\.github\.com|example\.(com|org))[A-Za-z][\w-]*\.[A-Za-z]{2,}\b/],
  ['private IP', /\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
]
const termsFile = '.dev/private-terms.txt'
const terms = existsSync(termsFile)
  ? readFileSync(termsFile, 'utf8')
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => t && !t.startsWith('#'))
  : []

const problems = []
for (const f of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(f))) problems.push(`${f}: file must not be committed`)
  if (!existsSync(f) || /\.(png|ico|jpe?g|webp|woff2?)$/.test(f) || f.endsWith('package-lock.json')) continue
  const lines = readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [what, re] of PATTERNS) if (re.test(line)) problems.push(`${f}:${i + 1}: ${what}`)
    const lower = line.toLowerCase()
    for (const t of terms) if (lower.includes(t.toLowerCase())) problems.push(`${f}:${i + 1}: private term`)
  })
}

if (problems.length) {
  console.error(`Possible secret or personal data:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`check-public: ${files.length} files clean${terms.length ? ` (+${terms.length} private terms)` : ''}`)
