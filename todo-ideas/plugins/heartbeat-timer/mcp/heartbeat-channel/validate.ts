#!/usr/bin/env bun
/**
 * validate.ts -- CLI-Validator fuer timer.md
 *
 * Benutzt denselben Parser wie der Runtime-Server (./parser.ts).
 * Exit 0 = alle Eintraege gueltig. Exit 1 = Fehler.
 *
 * Aufruf:
 *   bun mcp/heartbeat-channel/validate.ts [path/to/timer.md]
 *
 * Default-Pfad: <repo>/timer.md (ermittelt relativ zu dieser Datei).
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { parseTimerMd, type Entry } from './parser.ts'

function describe(e: Entry): string {
  if (e.schedule.kind === 'times') {
    return `${e.schedule.slots.join(', ')} on ${[...e.days].sort().join(',')} (${e.name})`
  }
  return `every ${e.schedule.minutes}min on ${[...e.days].sort().join(',')} (${e.name})`
}

// Plugin packaging: timer.md lives in the user's project, not next to the script.
// CLI override: pass an explicit path as positional arg.
function resolveDefaultTimerPath(): string {
  const idx = process.argv.indexOf('--project-root')
  const projectRoot = (idx >= 0 && process.argv[idx + 1])
    ? resolve(process.argv[idx + 1])
    : resolve(
        process.env.HEARTBEAT_PROJECT_ROOT
          ?? process.env.PROJECT_ROOT
          ?? process.cwd()
      )
  return resolve(projectRoot, 'timer.md')
}
const defaultPath = resolveDefaultTimerPath()
const positional = process.argv.slice(2).filter(a => !a.startsWith('-'))
const path = resolve(positional[0] ?? defaultPath)
const verbose = process.argv.includes('-v') || process.argv.includes('--verbose')

if (!existsSync(path)) {
  console.error(`ERROR: file not found: ${path}`)
  process.exit(1)
}

const text = readFileSync(path, 'utf-8')
const { entries, errors } = parseTimerMd(text)

for (const e of errors) {
  const who = e.name ? ` (${e.name})` : ''
  console.error(`ERROR ${path}:${e.line}${who}: ${e.message}`)
}

if (errors.length > 0) {
  console.error(`\nFAILED: ${errors.length} error(s), ${entries.length} valid timer(s) in ${path}`)
  process.exit(1)
}

console.log(`OK: ${entries.length} timer(s) valid in ${path}`)
if (verbose) {
  for (const e of entries) console.log(`  line ${e.line}: ${describe(e)}`)
}
process.exit(0)
