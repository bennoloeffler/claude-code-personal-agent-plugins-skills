#!/usr/bin/env bun
/**
 * state.ts -- CLI zum sicheren Editieren von .ai-heartbeat-timer/state.json
 *
 * Wird vom timer Skill benutzt wenn ein Timer geaendert/geloescht/umbenannt wird,
 * damit der State konsistent mit der neuen timer.md-Semantik bleibt.
 *
 * Commands:
 *   bun state.ts show
 *     Pretty-print current state (fuer Debugging).
 *
 *   bun state.ts delete <name>
 *     Entfernt <name> aus firedToday UND lastFire. Fuer: Timer-Delete oder
 *     Delete+Re-Add mit gleichem Namen/Slot am selben Tag.
 *
 *   bun state.ts rename <old> <new>
 *     Kopiert firedToday[old] -> firedToday[new] und lastFire[old] -> lastFire[new],
 *     loescht dann den alten Key. Fuer: Timer-Rename -- verhindert dass der neue
 *     Name "frisch" aussieht und sofort feuert.
 *
 *   bun state.ts touch <name>
 *     Setzt lastFire[name] = jetzt (ISO). Fuer: Time-List -> Interval Switch, wenn
 *     der Timer heute schon als Time-Slot gefeuert hat -- so laeuft das neue
 *     Intervall ab jetzt, nicht sofort nochmal.
 *
 * No-op wenn der State-File fehlt (ausser `touch`, das legt ihn an).
 *
 * Exit 0 bei Erfolg, Exit 1 bei Fehler (z.B. unbekanntes Command).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

type State = {
  day: string
  firedToday: Record<string, string[]>
  lastFire: Record<string, string>
  reportedErrorsToday: string[]
}

// Plugin packaging: data lives in the user's project (passed via env or CLI).
// CLI override: `--project-root <path>` for explicit targeting.
function resolveProjectRoot(): string {
  const idx = process.argv.indexOf('--project-root')
  if (idx >= 0 && process.argv[idx + 1]) return resolve(process.argv[idx + 1])
  return resolve(
    process.env.HEARTBEAT_PROJECT_ROOT
      ?? process.env.PROJECT_ROOT
      ?? process.cwd()
  )
}
const REPO = resolveProjectRoot()
const RUNTIME_DIR = resolve(REPO, '.ai-heartbeat-timer')
const STATE_FILE = resolve(RUNTIME_DIR, 'state.json')

function todayStr(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function emptyState(): State {
  return { day: todayStr(new Date()), firedToday: {}, lastFire: {}, reportedErrorsToday: [] }
}

function readState(): State | null {
  if (!existsSync(STATE_FILE)) return null
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Partial<State>
    return {
      day: raw.day ?? todayStr(new Date()),
      firedToday: raw.firedToday ?? {},
      lastFire: raw.lastFire ?? {},
      reportedErrorsToday: raw.reportedErrorsToday ?? [],
    }
  } catch (e) {
    console.error(`ERROR: state file corrupt: ${e}`)
    process.exit(1)
  }
}

function writeState(s: State) {
  try { mkdirSync(dirname(STATE_FILE), { recursive: true }) } catch {}
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n')
}

const [, , cmd, ...args] = process.argv

function usage(): never {
  console.error('Usage: bun state.ts <show | delete NAME | rename OLD NEW | touch NAME>')
  process.exit(1)
}

switch (cmd) {
  case 'show': {
    const s = readState()
    if (!s) {
      console.log('(no state file yet)')
      process.exit(0)
    }
    console.log(JSON.stringify(s, null, 2))
    break
  }

  case 'delete': {
    const name = args[0]
    if (!name) usage()
    const s = readState()
    if (!s) {
      console.log(`(no state file -- nothing to delete for '${name}')`)
      process.exit(0)
    }
    const hadFired = name in s.firedToday
    const hadLast = name in s.lastFire
    delete s.firedToday[name]
    delete s.lastFire[name]
    writeState(s)
    console.log(`deleted '${name}' from state (firedToday: ${hadFired}, lastFire: ${hadLast})`)
    break
  }

  case 'rename': {
    const [oldName, newName] = args
    if (!oldName || !newName) usage()
    if (oldName === newName) {
      console.log(`(old == new, nothing to do)`)
      process.exit(0)
    }
    const s = readState()
    if (!s) {
      console.log(`(no state file -- nothing to rename)`)
      process.exit(0)
    }
    let moved = 0
    if (oldName in s.firedToday) {
      s.firedToday[newName] = s.firedToday[oldName]
      delete s.firedToday[oldName]
      moved++
    }
    if (oldName in s.lastFire) {
      s.lastFire[newName] = s.lastFire[oldName]
      delete s.lastFire[oldName]
      moved++
    }
    writeState(s)
    console.log(`renamed '${oldName}' -> '${newName}' (${moved} state entries moved)`)
    break
  }

  case 'touch': {
    const name = args[0]
    if (!name) usage()
    const s = readState() ?? emptyState()
    // ensure day is current -- writeState below would otherwise preserve stale day
    const today = todayStr(new Date())
    if (s.day !== today) {
      s.day = today
      s.firedToday = {}
      s.reportedErrorsToday = []
    }
    s.lastFire[name] = new Date().toISOString()
    writeState(s)
    console.log(`touched lastFire['${name}'] = ${s.lastFire[name]}`)
    break
  }

  default:
    usage()
}
