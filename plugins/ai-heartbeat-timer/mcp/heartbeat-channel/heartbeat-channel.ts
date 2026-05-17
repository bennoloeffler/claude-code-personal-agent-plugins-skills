#!/usr/bin/env bun
/**
 * heartbeat-channel -- selbst-tickender MCP Channel Server.
 *
 * Liest jede Minute ./timer.md und pusht faellige Eintraege als
 *   <channel source="heartbeat" name="..." time="...">PROMPT</channel>
 * in die laufende Claude Code Session.
 *
 * Unterstuetzt:
 *   - Time-Lists:  "07:00, 14:00, 19:00"   (jeder Slot max 1x/Tag)
 *   - Intervalle:  "every 40min" / "alle 2h" / "every 2d"   (Last-Fire Tracking)
 *   - Tag-Listen:  "mo, mi, fr"  bzw.  "weekdays", "weekend", "daily", leer=daily
 *
 * Grammatik + Validierung in ./parser.ts (gemeinsam mit CLI ./validate.ts).
 *
 * Runtime-Dateien leben in PROJECT_ROOT/.ai-heartbeat-timer/:
 *   state.json       (Tag + firedToday + lastFire + reportedErrorsToday)
 *   heartbeat.log    (lokale Zeit)
 *   heartbeat.lock   (Single-Firer Lease)
 *   status-<id>.txt  (eine Datei pro laufender Instanz)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { resolve } from 'path'
import {
  parseTimerMd,
  dueTimeSlots,
  intervalDue,
  type ParseError,
} from './parser.ts'
import { HeartbeatLock, type Role } from './lock.ts'

// --- Pfade ----------------------------------------------------------------
// Plugin packaging: code lives in the plugin cache, data lives in the user's project.
// Resolve PROJECT_ROOT from env (set by .mcp.json) or fall back to cwd.
const PROJECT_ROOT = process.env.HEARTBEAT_PROJECT_ROOT
  ?? process.env.PROJECT_ROOT
  ?? process.cwd()
const TIMER_FILE = resolve(PROJECT_ROOT, 'timer.md')
const RUNTIME_DIR = resolve(PROJECT_ROOT, '.ai-heartbeat-timer')
const STATE_FILE = resolve(RUNTIME_DIR, 'state.json')
const LOG_FILE = resolve(RUNTIME_DIR, 'heartbeat.log')
const LOCK_FILE = resolve(RUNTIME_DIR, 'heartbeat.lock')

// Ensure runtime dir exists before any file I/O (idempotent).
try { mkdirSync(RUNTIME_DIR, { recursive: true }) } catch {}

const WINDOW_MINUTES = 2
const TICK_MS = 60_000

// --- Logging --------------------------------------------------------------
function log(msg: string) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const line = `${ts} ${msg}\n`
  try {
    appendFileSync(LOG_FILE, line)
  } catch (e) {
    console.error(`heartbeat: log write failed: ${e}`)
  }
  console.error(line.trimEnd())
}

// --- State ----------------------------------------------------------------
type State = {
  day: string
  firedToday: Record<string, string[]>        // name -> slots ["07:00","14:00"]  (for time-list)
                                              //        or ["interval"] marker    (for intervals, not used for gating)
  lastFire: Record<string, string>            // name -> ISO timestamp (intervals only)
  reportedErrorsToday: string[]               // "lineN" identifiers
}

function emptyState(day: string): State {
  return { day, firedToday: {}, lastFire: {}, reportedErrorsToday: [] }
}

function todayStr(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function readState(today: string): State {
  if (!existsSync(STATE_FILE)) return emptyState(today)
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Partial<State>
    const lastFire = raw.lastFire && typeof raw.lastFire === 'object' ? raw.lastFire as Record<string, string> : {}
    if (raw.day !== today) {
      // new day: reset fired+errors, keep lastFire (intervals persist across days)
      return { day: today, firedToday: {}, lastFire, reportedErrorsToday: [] }
    }
    return {
      day: today,
      firedToday: raw.firedToday ?? {},
      lastFire,
      reportedErrorsToday: raw.reportedErrorsToday ?? [],
    }
  } catch (e) {
    log(`WARN state read failed, resetting: ${e}`)
    return emptyState(today)
  }
}

// Returns true on success, false on failure
function writeState(state: State): boolean {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
    return true
  } catch (e) {
    log(`FATAL state write failed: ${e}`)
    return false
  }
}

// --- Fatal Error Handler: stop all ticks, alert Claude -----------------------
let tickEnabled = true

async function handleFatalError(context: string, error: unknown) {
  tickEnabled = false
  log(`FATAL: ${context}: ${error} -- ALL TICKS STOPPED`)
  try {
    await pushChannel('heartbeat-fatal-error', new Date().toISOString(),
      `HEARTBEAT FATAL ERROR: ${context} -- ${error}. ` +
      `All timers stopped until restart. Inform the user. ` +
      `Fix: resolve the underlying cause, then restart Claude Code.`)
  } catch { /* best effort */ }
}

// --- MCP Server -----------------------------------------------------------
const mcp = new Server(
  { name: 'heartbeat', version: '0.3.0' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions:
      'Events from the heartbeat channel arrive as <channel source="heartbeat" name="..." time="..."> ' +
      'followed by a prompt body. Execute the prompt body fully (read emails, check calendar, ' +
      'write TODOs, send Telegram messages, etc.). No reply expected -- this is a one-way trigger. ' +
      'The "name" attribute identifies which scheduled task fired. ' +
      'Special name "timer-error" means timer.md has a broken entry that needs fixing -- tell the user.',
  },
)

await mcp.connect(new StdioServerTransport())

// --- Single-Firer Lock ----------------------------------------------------
const lock = new HeartbeatLock(LOCK_FILE, RUNTIME_DIR)
log(`heartbeat-channel started (tick every ${TICK_MS / 1000}s, window ±${WINDOW_MINUTES}min, instance=${lock.instanceId}, pid=${process.pid})`)

// Startup-Sweep: raeumt tote Status-Dateien und einen Lock mit toter Halter-PID auf
// (passiert wenn der vorherige Prozess via SIGKILL gestorben ist ohne release()).
{
  const swept = HeartbeatLock.sweepDeadInstances(RUNTIME_DIR, LOCK_FILE)
  if (swept.clearedLock) {
    log(`SWEPT dead lock (was held by instance=${swept.clearedLock.instanceId}, pid=${swept.clearedLock.pid})`)
  }
  if (swept.removedStatusFiles.length > 0) {
    log(`SWEPT ${swept.removedStatusFiles.length} stale status file(s): ${swept.removedStatusFiles.join(', ')}`)
  }
}

// Cleanup on shutdown -- release lock + remove own status file
let released = false
function releaseOnce() {
  if (released) return
  released = true
  lock.release()
}
process.on('SIGINT',  () => { releaseOnce(); process.exit(0) })
process.on('SIGTERM', () => { releaseOnce(); process.exit(0) })
process.on('exit',    releaseOnce)

// --- Orphan Self-Terminate (Fix B2) --------------------------------------
// Wenn der Parent (Claude Code) stirbt ohne SIGTERM/SIGINT weiterzureichen
// (z.B. SIGKILL von aussen), werden wir von init/launchd adoptiert. Dann
// ist ppid === 1 (Unix-Konvention). Wir wollen in dem Fall nicht als Zombie
// weiterlaufen und den Lock halten -- also sauber selbst beenden.
//
// ACHTUNG: `process.ppid` wird in Bun beim Start gecached und spiegelt
// Reparenting NICHT wider. Wir holen uns den aktuellen ppid via `ps`.
const ORPHAN_CHECK_MS = 10_000
const INITIAL_PPID = process.ppid

function getLivePpid(): number | null {
  try {
    const res = Bun.spawnSync({
      cmd: ['ps', '-o', 'ppid=', '-p', String(process.pid)],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const out = new TextDecoder().decode(res.stdout).trim()
    const n = parseInt(out, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

setInterval(() => {
  const live = getLivePpid()
  if (live === null) return                        // ps failed -> skip this check
  if (INITIAL_PPID === 1) return                   // already started orphaned (direct-exec) -- legitimate
  if (live === 1) {
    log(`ORPHANED (parent gone, ppid 1) -- releasing lock and exiting`)
    releaseOnce()
    process.exit(0)
  }
}, ORPHAN_CHECK_MS)

// Track previous role so we only log role-transitions in heartbeat.log
let prevRole: Role | null = null

// --- Notification helper --------------------------------------------------
async function pushChannel(name: string, time: string, content: string): Promise<boolean> {
  try {
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: { content, meta: { name, time } },
    })
    return true
  } catch (err) {
    log(`ERROR pushing ${name}: ${err}`)
    return false
  }
}

// --- Error reporting ------------------------------------------------------
async function reportErrors(errors: ParseError[], state: State, now: Date) {
  if (errors.length === 0) return
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  for (const err of errors) {
    const id = `line${err.line}`
    if (state.reportedErrorsToday.includes(id)) continue
    const who = err.name ? ` (Timer: ${err.name})` : ''
    const msg =
      `TIMER CONFIGURATION ERROR: timer.md line ${err.line}${who}: ${err.message}.\n\n` +
      `This timer is NOT active until corrected. Inform the user, ` +
      `show them the line and the error, and propose a fix. ` +
      `After the fix: run 'bun mcp/heartbeat-channel/validate.ts'.`
    const ok = await pushChannel('timer-error', nowTime, msg)
    if (ok) {
      state.reportedErrorsToday.push(id)
      log(`REPORTED error line ${err.line}: ${err.message}`)
    }
  }
}

// --- Tick loop ------------------------------------------------------------
async function tick() {
  if (!tickEnabled) return  // Fatal error occurred -- do not fire anything
  const now = new Date()
  const today = todayStr(now)

  // --- Lock check: only ACTIVE fires ---
  const lockResult = lock.acquireOrRefresh(now.getTime())
  const role = lockResult.role

  // Always refresh our own status file (overwritten, single line)
  lock.writeStatus(role, {
    holder: lockResult.holder,
    holderAge: lockResult.holderAgeMs !== undefined ? `${Math.round(lockResult.holderAgeMs / 1000)}s` : undefined,
  })

  // Log role transitions only (not every STANDBY tick)
  if (role !== prevRole) {
    if (role === 'ACQUIRED') log(`ACQUIRED lock (instance=${lock.instanceId})`)
    else if (role === 'STOLE') log(`STOLE lock from ${lockResult.holder} (reason=${lockResult.reason ?? 'unknown'}, age=${Math.round((lockResult.holderAgeMs ?? 0) / 1000)}s)`)
    else if (role === 'STANDBY') log(`STANDBY (holder=${lockResult.holder}, age=${Math.round((lockResult.holderAgeMs ?? 0) / 1000)}s)`)
    else if (role === 'ACTIVE' && prevRole !== null) log(`ACTIVE (refreshing lock)`)
    prevRole = role
  }

  // STANDBY: do nothing else this tick
  if (role === 'STANDBY') return

  let text: string
  try {
    text = readFileSync(TIMER_FILE, 'utf-8')
  } catch (e) {
    log(`WARN timer.md not readable (${e}) -- skipping tick`)
    return
  }

  const { entries, errors } = parseTimerMd(text)
  const state = readState(today)

  // Report parse errors first (one per line per day)
  await reportErrors(errors, state, now)

  let firedCount = 0
  for (const e of entries) {
    if (e.schedule.kind === 'times') {
      const firedSlots = new Set(state.firedToday[e.name] ?? [])
      const due = dueTimeSlots(e.schedule.slots, e.days, now, WINDOW_MINUTES, firedSlots)
      for (const slot of due) {
        // STATE-FIRST: mark as fired BEFORE pushing channel event
        firedSlots.add(slot)
        state.firedToday[e.name] = [...firedSlots].sort()
        if (!writeState(state)) {
          await handleFatalError(`state write before fire ${e.name}@${slot}`, 'writeState returned false')
          return
        }
        // Now safe to push -- even if push fails, we won't replay
        const ok = await pushChannel(e.name, slot, e.prompt)
        if (ok) {
          firedCount++
          log(`FIRED ${e.name} @${slot} (days=${[...e.days].sort().join(',')})`)
        } else {
          log(`WARN push failed for ${e.name}@${slot} -- state already marked, will NOT retry`)
        }
      }
    } else {
      // interval
      const lastStr = state.lastFire[e.name]
      const lastFire = lastStr ? new Date(lastStr) : null
      if (intervalDue(e.schedule.minutes, e.days, now, lastFire)) {
        const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        // STATE-FIRST: mark as fired BEFORE pushing channel event
        state.lastFire[e.name] = now.toISOString()
        if (!writeState(state)) {
          await handleFatalError(`state write before fire ${e.name} (interval)`, 'writeState returned false')
          return
        }
        const ok = await pushChannel(e.name, nowTime, e.prompt)
        if (ok) {
          firedCount++
          log(`FIRED ${e.name} (interval=${e.schedule.minutes}min, days=${[...e.days].sort().join(',')})`)
        } else {
          log(`WARN push failed for ${e.name} (interval) -- state already marked, will NOT retry`)
        }
      }
    }
  }

  // Error reporting may also need state write
  if (errors.length > 0) {
    if (!writeState(state)) {
      await handleFatalError('state write after error reporting', 'writeState returned false')
    }
  }
}

// Startup-Jitter (0-1000ms) to decorrelate simultaneous session starts
await lock.jitterStartup()
tick().catch(e => log(`ERROR initial tick: ${e}`))
setInterval(() => {
  tick().catch(e => log(`ERROR tick: ${e}`))
}, TICK_MS)
