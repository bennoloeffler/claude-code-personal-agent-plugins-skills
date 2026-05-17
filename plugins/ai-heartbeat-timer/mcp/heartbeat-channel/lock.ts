/**
 * Single-Firer Lock fuer Heartbeat-MCP.
 *
 * Verhindert Doppel-Fires wenn mehrere Claude-Code-Sessions im selben
 * Projekt laufen. Nur der Lock-Halter (ACTIVE) feuert; alle anderen
 * Prozesse bleiben STANDBY.
 *
 * Design: Lease-basierter File-Lock mit atomic-rename.
 * Refresh jede Minute, Stale-Detection nach 5 Minuten, Race-Tie-Break
 * ueber nachgelagerten Re-Read.
 *
 * Doc: ../../docs/HEARTBEAT-LOCK.md
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync, readdirSync } from 'fs'
import { randomBytes } from 'crypto'

export const REFRESH_INTERVAL_MS = 60_000    // 1 min (= Tick)
export const STALE_MS = 5 * 60_000           // 5 min
export const STARTUP_JITTER_MAX_MS = 1000    // 0-1s

export type Role = 'ACTIVE' | 'ACQUIRED' | 'STANDBY' | 'STOLE'
export type StealReason = 'dead-pid' | 'stale-age'

/**
 * Liveness-Check: ist die PID noch ein laufender Prozess?
 *
 * `process.kill(pid, 0)` wirft bei nicht-existenter PID ESRCH, bei existenter
 * aber fremder PID EPERM (auf Unix). Wir behandeln EPERM als "lebt" -- reicht
 * fuer unseren Fall (Lock-Halter ist typischerweise vom selben User).
 *
 * Vorbehalt: PID-Recycling. Wenn die alte PID inzwischen an einen voellig
 * anderen Prozess vergeben wurde, halten wir ihn faelschlich fuer unseren
 * alten Lock-Halter. Auf macOS (PID-Space ~32k, inkrementell) unwahrscheinlich
 * innerhalb der STALE_MS-Periode; der Stale-Age-Fallback greift sonst.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ESRCH') return false   // no such process
    if (code === 'EPERM') return true    // exists but no permission
    return true                           // unknown -> be conservative
  }
}

type LockPayload = {
  pid: number
  instanceId: string
  startedAt: string        // ISO
  lastHeartbeat: string    // ISO
}

type Paths = {
  lockFile: string         // .ai-heartbeat-timer/heartbeat.lock
  statusFile: string       // .ai-heartbeat-timer/status-<instanceId>.txt
}

export const DEFAULT_STATUS_PREFIX = 'status-'

export class HeartbeatLock {
  readonly instanceId: string
  readonly startedAt: string
  private paths: Paths

  constructor(lockFile: string, statusDir: string, statusPrefix = DEFAULT_STATUS_PREFIX) {
    this.instanceId = randomBytes(4).toString('hex')
    this.startedAt = new Date().toISOString()
    this.paths = {
      lockFile,
      statusFile: `${statusDir}/${statusPrefix}${this.instanceId}.txt`,
    }
  }

  /** Random initial sleep to decorrelate simultaneous starts. */
  async jitterStartup(): Promise<void> {
    const ms = Math.floor(Math.random() * STARTUP_JITTER_MAX_MS)
    await new Promise(r => setTimeout(r, ms))
  }

  /**
   * Try to acquire or refresh the lock. Returns the role for this tick.
   *
   * - ACTIVE   : we already held the lock, refreshed it
   * - ACQUIRED : we just took an empty lock
   * - STOLE    : we took over a dead or stale lock (see `reason`)
   * - STANDBY  : someone else holds a fresh lock and is alive, we wait
   */
  acquireOrRefresh(now = Date.now()): {
    role: Role
    holder?: string
    holderAgeMs?: number
    reason?: StealReason
  } {
    const existing = this.readLockOrNull()

    // Case 1: no lock at all
    if (existing === null) {
      this.writeLockAtomic({
        pid: process.pid,
        instanceId: this.instanceId,
        startedAt: this.startedAt,
        lastHeartbeat: new Date(now).toISOString(),
      })
      return this.verifyIsMine() ? { role: 'ACQUIRED' } : this.standbyAfterLoss()
    }

    // Case 2: we already hold it -> refresh
    if (existing.instanceId === this.instanceId) {
      this.writeLockAtomic({ ...existing, lastHeartbeat: new Date(now).toISOString() })
      return { role: 'ACTIVE' }
    }

    // Case 3: someone else holds it
    const holderLast = Date.parse(existing.lastHeartbeat)
    const age = now - holderLast

    // Case 3a: PID ist tot -> sofort uebernehmen, egal wie frisch der lastHeartbeat
    // aussieht. Ein toter Prozess refresht nicht mehr; warten auf STALE_MS ist
    // unnoetige 5min-Downtime.
    if (!isProcessAlive(existing.pid)) {
      this.writeLockAtomic({
        pid: process.pid,
        instanceId: this.instanceId,
        startedAt: this.startedAt,
        lastHeartbeat: new Date(now).toISOString(),
      })
      return this.verifyIsMine()
        ? { role: 'STOLE', holder: existing.instanceId, holderAgeMs: age, reason: 'dead-pid' }
        : this.standbyAfterLoss()
    }

    // Case 3b: PID lebt, aber Lock ist stale (5min ohne Refresh) -> uebernehmen
    if (!Number.isFinite(holderLast) || age >= STALE_MS) {
      this.writeLockAtomic({
        pid: process.pid,
        instanceId: this.instanceId,
        startedAt: this.startedAt,
        lastHeartbeat: new Date(now).toISOString(),
      })
      return this.verifyIsMine()
        ? { role: 'STOLE', holder: existing.instanceId, holderAgeMs: age, reason: 'stale-age' }
        : this.standbyAfterLoss()
    }

    // Fresh foreign lock -> standby
    return { role: 'STANDBY', holder: existing.instanceId, holderAgeMs: age }
  }

  /** Write status line to our own per-instance file (overwrite, not append). */
  writeStatus(role: Role, extra: Record<string, string | number | undefined> = {}) {
    const ts = formatLocal(new Date())
    const parts = [
      ts,
      `role=${role}`,
      `pid=${process.pid}`,
      `instance=${this.instanceId}`,
      ...Object.entries(extra)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`),
    ]
    try {
      writeFileSync(this.paths.statusFile, parts.join('  ') + '\n')
    } catch {
      // non-fatal
    }
  }

  /** Called from SIGINT/SIGTERM/exit. Releases lock if we own it, removes status file. */
  release() {
    try {
      if (this.verifyIsMine()) unlinkSync(this.paths.lockFile)
    } catch {}
    try {
      if (existsSync(this.paths.statusFile)) unlinkSync(this.paths.statusFile)
    } catch {}
  }

  get statusFilePath() {
    return this.paths.statusFile
  }

  /**
   * Startup-Sweep: loesche Status-Dateien toter Prozesse und raeume den Lock
   * auf falls sein Halter-PID nicht mehr existiert.
   *
   * Safe to call immer beim Start, bevor acquireOrRefresh() aufgerufen wird.
   * Gibt die Liste der aufgeraeumten Eintraege zurueck fuer Logging.
   */
  static sweepDeadInstances(
    statusDir: string,
    lockFile: string,
    statusPrefix = DEFAULT_STATUS_PREFIX,
  ): { removedStatusFiles: string[]; clearedLock: { pid: number; instanceId: string } | null } {
    const removedStatusFiles: string[] = []
    let clearedLock: { pid: number; instanceId: string } | null = null

    // 1. Status-Dateien toter PIDs loeschen
    let files: string[] = []
    try {
      files = readdirSync(statusDir).filter((f: string) => f.startsWith(statusPrefix) && f.endsWith('.txt'))
    } catch {
      // Dir nicht lesbar -> nichts zu tun
    }
    for (const f of files) {
      const full = `${statusDir}/${f}`
      try {
        const content = readFileSync(full, 'utf-8')
        const m = content.match(/\bpid=(\d+)\b/)
        const pid = m ? parseInt(m[1], 10) : NaN
        if (Number.isFinite(pid) && !isProcessAlive(pid)) {
          unlinkSync(full)
          removedStatusFiles.push(f)
        }
      } catch {
        // einzelne Datei nicht lesbar/loeschbar -> skip
      }
    }

    // 2. Wenn heartbeat.lock existiert und Halter-PID tot ist: Lock loeschen
    try {
      if (existsSync(lockFile)) {
        const raw = JSON.parse(readFileSync(lockFile, 'utf-8'))
        if (typeof raw?.pid === 'number' && typeof raw?.instanceId === 'string') {
          if (!isProcessAlive(raw.pid)) {
            unlinkSync(lockFile)
            clearedLock = { pid: raw.pid, instanceId: raw.instanceId }
          }
        }
      }
    } catch {
      // malformed lock -> nicht anfassen, acquireOrRefresh behandelt das
    }

    return { removedStatusFiles, clearedLock }
  }

  // --- internals ----------------------------------------------------------

  private readLockOrNull(): LockPayload | null {
    if (!existsSync(this.paths.lockFile)) return null
    try {
      const raw = JSON.parse(readFileSync(this.paths.lockFile, 'utf-8'))
      if (
        typeof raw?.instanceId === 'string' &&
        typeof raw?.lastHeartbeat === 'string' &&
        typeof raw?.pid === 'number' &&
        typeof raw?.startedAt === 'string'
      ) {
        return raw as LockPayload
      }
      return null // malformed -> treat as missing/stale
    } catch {
      return null
    }
  }

  private writeLockAtomic(payload: LockPayload) {
    const tmp = `${this.paths.lockFile}.tmp.${this.instanceId}`
    writeFileSync(tmp, JSON.stringify(payload))
    renameSync(tmp, this.paths.lockFile)     // atomic on POSIX
  }

  private verifyIsMine(): boolean {
    const current = this.readLockOrNull()
    return current?.instanceId === this.instanceId
  }

  private standbyAfterLoss(): { role: Role; holder?: string; holderAgeMs?: number; reason?: StealReason } {
    const current = this.readLockOrNull()
    return { role: 'STANDBY', holder: current?.instanceId }
  }
}

function formatLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
