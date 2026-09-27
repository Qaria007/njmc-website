// claims-lint (docs/02). Phase 1 scope: every public-site source file under src/ except the
// admin panel and generated files. Phase 3 extends it to published CMS content.
// Fails with file, line and match.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN = ['src/app', 'src/components', 'src/lib', 'src/content']
const SKIP = [/\(payload\)/, /importMap\.js$/, /\.css$/]

type Rule = { name: string; re: RegExp; allow?: RegExp }

const rules: Rule[] = [
  { name: 'em or en dash', re: /[–—]/ },
  { name: 'unfilled [OPEN] placeholder', re: /\[OPEN/ },
  // A letter (Latin or Arabic) or closing bracket followed by ! or the full-width ！, and not
  // the start of != / !== or a TypeScript non-null assertion (x!.y, x!)).
  { name: 'exclamation mark', re: /([A-Za-z؀-ۿ)\]'"]\s*[!！](?![=.)\],;]))|！/ },
  {
    name: 'hype or banned word',
    re: /\b(revolutionary|world-class|best-in-class|leading|cutting-edge|unparalleled|seamless(ly)?|state-of-the-art|leverages|leveraging|robust|delve|unlock|elevate|empower|streamline|comprehensive suite|tailored solutions|trusted partner|trusted ally)\b/i,
  },
  {
    name: 'guarantee claim by NJMC',
    re: /\b(we|NJMC)\b[^.\n]{0,40}\bguarantee(d|s)?\b|\bguaranteed (quality|delivery|results?|supply)\b|\b(to|we|can) leverage\b/i,
    allow: /\b(not|never|no|cannot|can't)\b[^.\n]{0,20}\bguarantee/i,
  },
  { name: 'figurative navigate or landscape', re: /\b(navigat(e|ing) the|the [a-z]+ landscape|landscape of)\b/i },
  { name: 'banned sentence opener', re: /(^|[.>"'`]\s*)(Moreover|Furthermore|Additionally|In today's|In an era of|It is important to note|When it comes to)\b/ },
  {
    name: 'NJMC certification or approval claim',
    re: /\b(NJMC|we)\b[^.\n]{0,40}\b(certif(y|ies|ied)|accredited|approv(e|es|ed|al))\b/i,
    // The owner's approved wording and plain negations are allowed: "We don't certify."
    allow: /\b(don\\?['’]t|do not|never|not|no)\b[^.\n]{0,20}\b(certif|accredit|approv)/i,
  },
  { name: '"FDA certified"', re: /FDA[ -]certified/i },
  { name: 'pass/fail wording', re: /\bpass\/fail\b|NON-COMPLIANT/i },
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

// Drop comments but keep URLs: `//` starts a comment only at line start or after whitespace,
// never after ':' as in https://.
function visibleText(line: string): string {
  if (/^\s*(\*|\/\*)/.test(line)) return ''
  return line.replace(/\/\*.*?\*\//g, '').replace(/(^|\s)\/\/.*$/, '$1')
}

let failures = 0
for (const dir of SCAN) {
  for (const f of files(join(ROOT, dir))) {
    const rel = relative(ROOT, f)
    if (SKIP.some((s) => s.test(rel)) || !/\.(tsx?|md|mdx|json)$/.test(rel)) continue
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const text = visibleText(line)
        for (const r of rules) {
          const m = text.match(r.re)
          if (m && !(r.allow && r.allow.test(text))) {
            failures++
            console.error(`${rel}:${i + 1}  ${r.name}: "${m[0].trim()}"`)
          }
        }
      })
  }
}
if (failures) {
  console.error(`claims-lint: ${failures} problem(s)`)
  process.exit(1)
}
console.log('claims-lint: clean')
