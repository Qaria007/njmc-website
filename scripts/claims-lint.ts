// claims-lint (docs/02). Phase 1 scope: every public-site source file under src/ except the
// admin panel and generated files. Phase 3 extends it to published CMS content.
// Fails with file, line and match.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN = ['src/app', 'src/components', 'src/lib']
const SKIP = [/\(payload\)/, /importMap\.js$/, /\.css$/]

const rules: { name: string; re: RegExp }[] = [
  { name: 'em or en dash', re: /[–—]/ },
  { name: 'unfilled [OPEN] placeholder', re: /\[OPEN/ },
  {
    name: 'hype word',
    re: /\b(revolutionary|world-class|best-in-class|cutting-edge|unparalleled|seamless|state-of-the-art|leverage|robust|delve|unlock|elevate|empower|streamline|tailored solutions|trusted partner|trusted ally)\b/i,
  },
  { name: 'NJMC certification claim', re: /\b(NJMC|we)\b[^.\n]{0,40}\b(certif(y|ies|ied)|accredited|approves)\b/i },
  { name: '"FDA certified"', re: /FDA[ -]certified/i },
  { name: 'pass/fail wording', re: /\bpass\/fail\b|NON-COMPLIANT/i },
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

// Only text a visitor can read: string literals and JSX text, not comments.
function visibleText(line: string): string {
  const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
  return code.trim().startsWith('*') ? '' : code
}

let failures = 0
for (const dir of SCAN) {
  for (const f of files(join(ROOT, dir))) {
    const rel = relative(ROOT, f)
    if (SKIP.some((s) => s.test(rel)) || !/\.(tsx?|md|mdx|json)$/.test(rel)) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const text = visibleText(line)
      for (const r of rules) {
        const m = text.match(r.re)
        if (m) {
          failures++
          console.error(`${rel}:${i + 1}  ${r.name}: "${m[0]}"`)
        }
      }
      // "!" in visible JSX text or string literals (not !==, !x, or TS non-null).
      if (/(>[^<{}]*!\s*<)|(['"][^'"]*[A-Za-z]!['"])/.test(text)) {
        failures++
        console.error(`${rel}:${i + 1}  exclamation mark`)
      }
    })
  }
}
if (failures) {
  console.error(`claims-lint: ${failures} problem(s)`)
  process.exit(1)
}
console.log('claims-lint: clean')
