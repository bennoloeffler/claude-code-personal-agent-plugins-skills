# Heartbeat System -- Technical Documentation (V3.3)

> **Audience**: maintainers / a future Claude working on the plugin internals.
> **For usage**: see [`timer.md`](../timer.md) (format) and [`README.md`](../README.md).

## Was ist das?

Selbst-tickender MCP Channel Server. Liest jede Minute `timer.md`, matched
faellige Eintraege gegen die aktuelle Zeit, pusht den Prompt als
Channel-Event in die laufende Claude Code Session.

**Kein externes Scheduling.** Kein launchd, kein cron, kein HTTP, kein Token.
Eine Bun-Komponente, lebt mit Claude, stirbt mit Claude.

## Architektur

```
Claude Code launched with channel flag
        |
        v
Claude Code spawned MCP-Server (via .mcp.json)
        |
        v
bun mcp/heartbeat-channel/heartbeat-channel.ts
        |
        +-- MCP stdio-Verbindung zu Claude
        +-- setInterval(60_000, tick)
               |
               v jede Minute:
               +-- readFile timer.md
               +-- parseTimerMd(text) -> {entries, errors}      (parser.ts)
               +-- readState() -> {day, firedToday, lastFire, reportedErrors}
               +-- fuer jeden Error: pushChannel("timer-error", ...)   (1x/Tag/Zeile)
               +-- fuer jedes Entry:
               |     +-- time-list  -> check dueTimeSlots() fuer jeden Slot
               |     +-- interval   -> check intervalDue() gegen lastFire
               |     +-- wenn due:  pushChannel(name, time, prompt)
               +-- writeState()

Claude-Session sieht:
   <channel source="heartbeat" name="..." time="...">PROMPT</channel>
```

## Dateien

| Pfad | Zweck | Wer schreibt |
|------|-------|--------------|
| `timer.md` | Timer-Spec + aktive Eintraege + Format-Anleitung | User + Claude |
| `.heartbeat-timer/` | Runtime-Folder (wird beim ersten Tick angelegt) | Runtime |
| `.heartbeat-timer/state.json` | JSON-State (siehe unten) | Runtime |
| `.heartbeat-timer/heartbeat.log` | Append-Log in lokaler Zeit | Runtime |
| `.heartbeat-timer/heartbeat.lock` | Single-Firer Lease (siehe `lock.ts`) | Runtime |
| `.heartbeat-timer/status-<instanceId>.txt` | Live-Status pro Instanz (overwrite, eine Datei pro laufendem Prozess) | Runtime |
| `mcp/heartbeat-channel/parser.ts` | Parser + Validator (pure, kein FS). **Shared** zwischen Runtime und CLI. | -- |
| `mcp/heartbeat-channel/heartbeat-channel.ts` | MCP Server, Tick-Loop, State-IO, Error-Reporting | -- |
| `mcp/heartbeat-channel/validate.ts` | CLI-Validator, `bun ./validate.ts` | -- |
| `mcp/heartbeat-channel/state.ts` | CLI State-Ops: `show`, `delete NAME`, `rename OLD NEW`, `touch NAME`. Wird vom `timer` Skill benutzt damit State konsistent mit timer.md bleibt. | -- |
| `mcp/heartbeat-channel/package.json` | Bun deps | -- |
| `.mcp.json` | Registriert `heartbeat` als MCP-Server | -- |

## Format (vollstaendig in `timer.md`)

### Zeit-Spalte

Zwei disjunkte Varianten:

**Zeitpunkte** (time-list):
- `HH:MM` oder `H:MM` (Minute strict 2-stellig)
- Komma-separierte Liste: `7:00, 14:00, 19:00`
- Duplikate abgelehnt
- Jeder Slot feuert max 1x/Tag

**Intervall**:
- `every N unit` / `alle N unit`
- `unit = min | h | d`
- **Min 15 Minuten** (hart, per `MIN_INTERVAL_MIN` Konstante)
- Erster Fire: sofort beim ersten aktiven Tick
- Folge-Fires: wenn `now - lastFire >= interval`

### Tage-Spalte

- Leer / `*` / `daily` = Set(0..6)
- `weekdays` = Mo-Fr (1-5)
- `weekend` = Sa+So (0, 6)
- Einzelner Tag: `monday`..`sunday`, `mon`/`tue`/..., `montag`..`sonntag`, `mo`/`di`/...
- Liste: `mo, wednesday, fr` -- beliebig gemischt, case-insensitive

JS `getDay()` Konvention: Sun=0, Mon=1, ..., Sat=6.

### Name

`^[a-z0-9-]+$`, eindeutig in der Datei.

### Prompt

≥20 Zeichen, einzeilig, kein `|`.

## State-Format (`.heartbeat-timer/state.json`)

```json
{
  "day": "2026-04-13",
  "firedToday": {
    "morgen-check": ["07:00"],
    "triple-check": ["07:00", "14:00"]
  },
  "lastFire": {
    "pulse-work": "2026-04-13T08:40:12.345Z"
  },
  "reportedErrorsToday": ["line42"]
}
```

| Feld | Reset bei | Zweck |
|------|-----------|-------|
| `day` | nie (wird auf heute geschrieben) | Tageswechsel-Erkennung |
| `firedToday` | Tageswechsel | Time-List Slots nicht doppelt feuern |
| `lastFire` | **nie** -- persistiert taegeuebergreifend | Intervall-Referenzpunkt |
| `reportedErrorsToday` | Tageswechsel | Parse-Errors nicht spammen |

Tageswechsel-Logik: beim Lesen vergleichen wir `raw.day` mit `today`. Bei
Mismatch: `firedToday` und `reportedErrorsToday` werden geleert, `lastFire`
bleibt. `day` wird nicht sofort ueberschrieben sondern erst beim naechsten
Write (der passiert nur wenn was gefeuert oder ein Error gemeldet wurde).

## Matching-Semantik

### Time-List

```typescript
function dueTimeSlots(slots, days, now, windowMin, firedToday): string[] {
  if (!days.has(now.getDay())) return []
  const current = now.getHours() * 60 + now.getMinutes()
  return slots.filter(slot => {
    if (firedToday.has(slot)) return false
    const [h, m] = slot.split(':').map(Number)
    return Math.abs(current - (h*60 + m)) <= windowMin
  })
}
```

Window = 2 Minuten. Beispiel: Timer `07:00` mit windowMin=2 matched bei
current ∈ [6:58, 7:02].

### Interval

```typescript
function intervalDue(intervalMin, days, now, lastFire): boolean {
  if (!days.has(now.getDay())) return false
  if (!lastFire) return true
  const delta = Math.max(0, now - lastFire)  // DST-safe
  return delta >= intervalMin * 60_000
}
```

- Kein Fuzzy-Window. Tick ist jede Minute, genuegt.
- Bei erstem Lauf (lastFire=null): sofort feuern am ersten aktiven Tag.
- Tag-Filter-Pause: `lastFire` bleibt auf Fr 18:00 stehen, am Sa/So passiert
  nix (wenn nicht in `days`), am Mo 08:00 feuert sofort (Delta > Interval).
- **DST-Rueckstellung** (Oktober, 03:00→02:00): `Math.max(0, delta)` verhindert
  dass der Timer waehrend der rueckwaerts laufenden Stunde haengenbleibt. Ohne
  den Clamp waere delta negativ und der Timer wuerde 30-90min zu lange schweigen.

## Error-Reporting

Parser trennt `entries` (valid) und `errors` (invalid rows). Fuer jeden Error
pusht der Runtime **einmal pro Tag** eine Nachricht mit `name: "timer-error"`
an Claude. Dedup-Key ist `line<N>`.

Prompt-Template:
```
TIMER CONFIGURATION ERROR: timer.md line <N> (Timer: <name>): <reason>.

This timer is NOT active until corrected. Inform the user, show them
the line and the error, and propose a fix.
After the fix: run 'bun mcp/heartbeat-channel/validate.ts'.
```

The MCP server's `instructions` field tells Claude how to react to `name="timer-error"`.

## Robustheit

| Problem | Verhalten |
|---------|-----------|
| `timer.md` fehlt/unreadable | WARN im Log, Tick macht nichts, System tickt weiter |
| Zeile in `timer.md` invalid | Zeile wird nicht zu Entry, landet in `errors`, Runtime pusht `timer-error` notification 1x/Tag |
| `.heartbeat-timer/state.json` fehlt | Fresh state, alle Timer koennen heute noch feuern |
| `.heartbeat-timer/state.json` korrupt | WARN + reset, wie "fehlt" |
| `.heartbeat-timer/` fehlt | Wird beim ersten Tick via `mkdirSync(recursive)` angelegt |
| Tageswechsel | `firedToday` + `reportedErrorsToday` geleert, `lastFire` bleibt |
| `mcp.notification` throws | ERROR im Log, Timer/Error NICHT als gefeuert/gemeldet markiert, Retry naechster Tick im Fenster |
| Rechner schlaeft durch Time-Slot-Fenster | Slot verpasst, faellt auf morgen |
| Rechner schlaeft durch Intervall | Interval feuert beim Aufwachen sofort (Delta >> Intervall) |
| MCP-Server crashed | `/mcp` in Claude zeigt Status. Kein Auto-Restart durch Claude Code. |

## Zeitzone

- `new Date()`/`getHours()`/`getMinutes()` = lokale Systemzeit (Bun/Node).
- Logger seit 2026-04-13 lokal.
- On `TZ=UTC` servers the timer fires according to UTC; set `TZ=<your-tz>` (e.g. `Europe/Berlin`) in the environment if you want local-time scheduling.

## Smoke-Test Workflow

```bash
# 1. Validator
bun mcp/heartbeat-channel/validate.ts
bun mcp/heartbeat-channel/validate.ts --verbose   # zeigt kanonische Ausgabe

# 2. MCP-Server alleine starten
timeout 2 bun mcp/heartbeat-channel/heartbeat-channel.ts
# Erwartet: "YYYY-MM-DD HH:MM:SS heartbeat-channel started (tick every 60s, window ±2min)"

# 3. Live-Test in Claude Code
#    a. start Claude Code with the channel flag
#    b. in timer.md einen Timer fuer aktuelle Minute +1 eintragen
#    c. validate
#    d. max 2min warten -> Event in Session
#    e. cat .heartbeat-timer/state.json -> Name in firedToday oder lastFire
#    f. tail -5 .heartbeat-timer/heartbeat.log -> FIRED-Zeile
#    g. Test-Timer raus editieren
```

## API (MCP Channel Notification)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/claude/channel",
  "params": {
    "content": "<prompt aus timer.md>",
    "meta": {
      "name": "morgen-check",
      "time": "07:00"
    }
  }
}
```

`meta.time` fuer:
- Time-Slot-Fire: der kanonische Slot (`"07:00"`)
- Interval-Fire: die aktuelle Uhrzeit des Fires (`"12:40"`)
- Error-Report: die aktuelle Uhrzeit

Server-Capabilities:
```typescript
capabilities: { experimental: { 'claude/channel': {} } }
```

## Konstanten (`heartbeat-channel.ts` / `parser.ts`)

```typescript
// heartbeat-channel.ts
const WINDOW_MINUTES = 2
const TICK_MS = 60_000

// parser.ts
const MIN_INTERVAL_MIN = 15
const MIN_PROMPT_LEN = 20
```

Aenderungen brauchen Neustart der Claude Session (der MCP-Subprozess wird
neu gespawned und liest die aktualisierten Konstanten).

## Debugging

| Symptom | Check |
|---------|-------|
| Timer feuert nicht | `tail -f .heartbeat-timer/heartbeat.log` + `cat .heartbeat-timer/state.json`. Ist Name in `firedToday`? In `errors`-Report? |
| Timer feuert doppelt | Bei gleichem Namen nicht moeglich. Bei Namens-Aenderung wird alter Name nicht mehr geprueft -> neuer Name feuert frisch. |
| Interval feuert zu oft / zu selten | `lastFire` pruefen. Rechner TZ falsch? |
| MCP-Server laeuft nicht | `/mcp` in Claude. Stderr: `~/.claude/debug/<session-id>.txt`. |
| Parser frisst Zeile nicht | Tabelle muss mit `| Zeit` starten. Zeile muss mit `|` beginnen. Pipe im Prompt bricht Columns. |
| `timer-error` Event kommt | Parse-Error. Claude liest die Message und weist den User drauf hin. |

## Design-Entscheidungen

**Warum shared parser (nicht dupliziert in TS + Py)?**
Konsistenz-Garantie. "Was der Validator OK sagt, feuert auch wirklich."
Python-Validator wurde 2026-04-13 geloescht.

**Warum JSON-State (nicht Plaintext)?**
Time-Slots (Array per Name) + Interval-Timestamps + Error-Dedup brauchen
strukturierte Felder. Plaintext waere erfunden.

**Warum Min-Interval 15min?**
Jeder Interval-Fire kostet Tokens (Claude verarbeitet den Prompt). Kleiner als
15min = Agent lernt nicht mehr, weil staendig unterbrochen.

**Warum keine Cron-Syntax?**
Cron ist kryptisch und kann "every 40min" nicht sauber (40 teilt 60 nicht
→ Sprung von 40 auf 20 Minuten). Wir haben Minuten-Aufloesung und eigenes
last-fire-Tracking -- bessere Semantik.

**Warum time-list UND interval in derselben Spalte?**
Konzeptuell beides eine "Schedule". Spalte heisst `Zeit`. Alternative waere
eine separate `Typ`-Spalte oder zwei getrennte Tabellen -- mehr Komplexitaet
ohne Nutzen. Disambiguierung per Keyword (`every`/`alle`) ist eindeutig.

## Geschichte

| Version | Beschreibung | Warum ersetzt |
|---------|--------------|---------------|
| **V1** | `/loop` + `CronCreate` + `scripts/heartbeat.py` | Session-scoped, nicht persistent, bei jedem Claude-Start neu aufzusetzen. |
| **V2** | `inject-timer-events.py` + launchd + HTTP-MCP-Server | 3 Komponenten + Token + Port. Fragil. |
| **V3.0** | Selbst-tickender MCP-Server (1 Komponente) | Basis. Nur HH:MM + Einzel-Tag. |
| **V3.1** | + Time-Lists, + Tag-Listen, + Intervalle, + Shared Parser, + Error-Reporting, + JSON-State | Flexibilitaet + Py→TS-Unifizierung |
| **V3.2** | + State-CLI (`state.ts`), + DST-Clamp in `intervalDue`, + `timer` Skill mit DELETE/UPDATE inkl. State-Migration | Kollisionsfreier Timer-Lifecycle |
| **V3.3 (aktuell)** | + Single-Firer Lock (`lock.ts`), + PID-Liveness-Check (Fix A), + Orphan Self-Terminate via live `ps` (Fix B2), + Startup-Sweep (Fix C) | Multi-Session-Safe, Kill-Resilient (Recovery ≤60s statt 5min) |

## Related Files

- [`../README.md`](../README.md) -- user-facing install & usage
- [`../templates/timer.md`](../templates/timer.md) -- timer.md format spec + starter template
- [`../.mcp.json`](../.mcp.json) -- MCP-Server-Registrierung
- [`../mcp/heartbeat-channel/parser.ts`](../mcp/heartbeat-channel/parser.ts) -- Parser+Validator
- [`../mcp/heartbeat-channel/heartbeat-channel.ts`](../mcp/heartbeat-channel/heartbeat-channel.ts) -- Runtime
- [`../mcp/heartbeat-channel/validate.ts`](../mcp/heartbeat-channel/validate.ts) -- CLI
