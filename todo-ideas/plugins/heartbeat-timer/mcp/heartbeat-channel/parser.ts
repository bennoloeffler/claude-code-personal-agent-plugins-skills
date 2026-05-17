/**
 * parser.ts -- Parser & Validator fuer timer.md
 *
 * Pure Funktionen, kein FS/IO. Gemeinsam genutzt von:
 *   - heartbeat-channel.ts (Runtime)
 *   - validate.ts          (CLI)
 *
 * Grammatik (case-insensitive):
 *
 *   zeit_spec  = time_list | interval
 *   time_list  = time ("," time)*              # "7:50"  oder  "7:00, 14:00, 19:00"
 *   time       = [0-9]{1,2} ":" [0-9]{2}       # "7:50" oder "07:50"; Minute strict 2-stellig
 *   interval   = ("every"|"alle") \s+ N \s* unit
 *   unit       = "min" | "h" | "d"
 *
 *   tage_spec  = "" | "*" | "daily" | "weekdays" | "weekend" | day_list
 *   day_list   = day ("," day)*
 *   day        = monday..sunday | montag..sonntag
 *              | mon|tue|wed|thu|fri|sat|sun
 *              | mo|di|mi|do|fr|sa|so
 *
 *   name       = [a-z0-9-]+   (eindeutig)
 *   prompt     = min 20 Zeichen, einzeilig, kein `|` (Tabellen-Separator)
 *
 * Min-Intervall: 15 Minuten. Kleinere Intervalle werden abgelehnt.
 */

export const MIN_INTERVAL_MIN = 15
export const MIN_PROMPT_LEN = 20

// Sun=0..Sat=6 (matches JS getDay())
export const DAY_MAP: Record<string, number> = {
  // English long
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  // English short
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  // German long
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  // German short
  so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
}

export type Schedule =
  | { kind: 'times'; slots: string[] }           // canonical "HH:MM"
  | { kind: 'interval'; minutes: number }

export type Entry = {
  line: number
  schedule: Schedule
  days: Set<number>
  name: string
  prompt: string
  raw: { zeit: string; tage: string }
}

export type ParseError = {
  line: number
  name?: string
  message: string
}

export type ParseResult = {
  entries: Entry[]
  errors: ParseError[]
}

// --- Zeit-Spec -------------------------------------------------------------

const INTERVAL_RE = /^(?:every|alle)\s+(\d+)\s*(min|minutes?|h|hours?|d|days?)$/i
const TIME_RE = /^(\d{1,2}):(\d{2})$/

export function parseZeitSpec(input: string): Schedule | string {
  const s = input.trim()
  if (!s) return 'zeit is empty'

  // Interval?
  if (/^(every|alle)\b/i.test(s)) {
    const m = s.match(INTERVAL_RE)
    if (!m) return `interval syntax: expected 'every N min|h|d' (got '${s}')`
    const n = parseInt(m[1], 10)
    const unit = m[2].toLowerCase()
    let minutes: number
    if (unit.startsWith('min') || unit.startsWith('minute')) minutes = n
    else if (unit === 'h' || unit.startsWith('hour')) minutes = n * 60
    else if (unit === 'd' || unit.startsWith('day')) minutes = n * 60 * 24
    else return `unknown unit '${unit}'`
    if (n <= 0) return `interval must be positive (got ${n})`
    if (minutes < MIN_INTERVAL_MIN) {
      return `interval ${minutes}min too short (min ${MIN_INTERVAL_MIN}min -- smaller would overload the agent)`
    }
    return { kind: 'interval', minutes }
  }

  // Time list
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return 'no times given'
  const slots: string[] = []
  for (const p of parts) {
    const m = p.match(TIME_RE)
    if (!m) return `invalid time '${p}' (expected H:MM or HH:MM)`
    const h = parseInt(m[1], 10)
    const mi = parseInt(m[2], 10)
    if (h < 0 || h > 23) return `hour '${h}' out of range 0-23 (in '${p}')`
    if (mi < 0 || mi > 59) return `minute '${mi}' out of range 0-59 (in '${p}')`
    const canon = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
    if (slots.includes(canon)) return `duplicate time '${canon}' in time list`
    slots.push(canon)
  }
  return { kind: 'times', slots }
}

// --- Tage-Spec -------------------------------------------------------------

export function parseTageSpec(input: string): Set<number> | string {
  const s = input.trim().toLowerCase()
  if (s === '' || s === '*' || s === 'daily') return new Set([0, 1, 2, 3, 4, 5, 6])
  if (s === 'weekdays') return new Set([1, 2, 3, 4, 5])
  if (s === 'weekend') return new Set([0, 6])

  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return 'no days given'
  const out = new Set<number>()
  const seen: string[] = []
  for (const p of parts) {
    if (!(p in DAY_MAP)) {
      return `unknown day '${p}' (allowed: daily, weekdays, weekend, monday..sunday, montag..sonntag, short forms mon/tue/.../sun and mo/di/mi/do/fr/sa/so)`
    }
    if (seen.includes(p)) return `duplicate day '${p}' in day list`
    seen.push(p)
    out.add(DAY_MAP[p])
  }
  return out
}

// --- Name + Prompt ---------------------------------------------------------

const NAME_RE = /^[a-z0-9-]+$/

export function validateName(s: string): string | null {
  if (!s) return 'name is empty'
  if (!NAME_RE.test(s)) return `name '${s}' invalid (allowed: [a-z0-9-]+, lowercase only)`
  return null
}

export function validatePrompt(s: string): string | null {
  if (!s) return 'prompt is empty'
  if (s.length < MIN_PROMPT_LEN) return `prompt only ${s.length} chars (min ${MIN_PROMPT_LEN}) -- looks like a typo or got truncated by a pipe?`
  return null
}

// --- Table parser ----------------------------------------------------------

/**
 * Finds the timer table (starts with `| Zeit ...`) and returns each data row.
 * Ignores everything before/after the table and the `|---|` separator row.
 */
export function parseTimerMd(text: string): ParseResult {
  const lines = text.split('\n')
  const entries: Entry[] = []
  const errors: ParseError[] = []
  const seenNames = new Map<string, number>()

  let inTable = false
  for (let i = 0; i < lines.length; i++) {
    const lineno = i + 1
    const stripped = lines[i].trim()

    // Find table start: must begin with "| Zeit"
    if (!inTable) {
      if (stripped.toLowerCase().startsWith('| zeit')) inTable = true
      continue
    }
    // Inside table
    if (stripped.startsWith('|---')) continue
    if (!stripped.startsWith('|')) {
      inTable = false
      continue
    }

    const cols = stripped.split('|').slice(1, -1).map(c => c.trim())
    if (cols.length < 4) {
      errors.push({
        line: lineno,
        message: `row has ${cols.length} columns, need 4 (Zeit | Tage | Name | Prompt). A '|' inside the prompt would break the table.`,
      })
      continue
    }

    const [zeitRaw, tageRaw, name, prompt] = [cols[0], cols[1], cols[2], cols[3]]

    // Name first (so we can attach it to later errors for this row)
    const nameErr = validateName(name)
    if (nameErr) {
      errors.push({ line: lineno, name: name || undefined, message: nameErr })
      continue
    }
    if (seenNames.has(name)) {
      errors.push({
        line: lineno,
        name,
        message: `duplicate name '${name}' (first seen at line ${seenNames.get(name)})`,
      })
      continue
    }

    const promptErr = validatePrompt(prompt)
    if (promptErr) {
      errors.push({ line: lineno, name, message: promptErr })
      continue
    }

    const schedule = parseZeitSpec(zeitRaw)
    if (typeof schedule === 'string') {
      errors.push({ line: lineno, name, message: `zeit '${zeitRaw}': ${schedule}` })
      continue
    }

    const days = parseTageSpec(tageRaw)
    if (typeof days === 'string') {
      errors.push({ line: lineno, name, message: `tage '${tageRaw}': ${days}` })
      continue
    }

    seenNames.set(name, lineno)
    entries.push({
      line: lineno,
      schedule,
      days,
      name,
      prompt,
      raw: { zeit: zeitRaw, tage: tageRaw },
    })
  }

  return { entries, errors }
}

// --- Matching helpers (used by runtime) -----------------------------------

/**
 * For time-list entries: returns slots that are due right now but haven't
 * fired yet today.
 */
export function dueTimeSlots(
  slots: string[],
  days: Set<number>,
  now: Date,
  windowMin: number,
  firedToday: ReadonlySet<string>,
): string[] {
  if (!days.has(now.getDay())) return []
  const current = now.getHours() * 60 + now.getMinutes()
  const due: string[] = []
  for (const slot of slots) {
    if (firedToday.has(slot)) continue
    const [h, m] = slot.split(':').map(n => parseInt(n, 10))
    const slotMin = h * 60 + m
    if (Math.abs(current - slotMin) <= windowMin) due.push(slot)
  }
  return due
}

/**
 * For interval entries: returns true if enough time has passed since the
 * last fire AND today is an active day. First-ever fire happens immediately
 * at the first tick on an active day.
 *
 * DST-safe: if the wall clock goes backwards (fall-back), the delta is
 * clamped to 0 so we never compute a negative "time passed". Without this,
 * an interval whose lastFire was in the ambiguous hour (03:00 → 02:00)
 * would refuse to fire for the duration of the rewind.
 */
export function intervalDue(
  intervalMin: number,
  days: Set<number>,
  now: Date,
  lastFire: Date | null,
): boolean {
  if (!days.has(now.getDay())) return false
  if (lastFire === null) return true
  const deltaMs = Math.max(0, now.getTime() - lastFire.getTime())
  return deltaMs >= intervalMin * 60_000
}
