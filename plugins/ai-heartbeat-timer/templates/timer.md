# Timer Schedule

This file defines all recurring prompts the ai-heartbeat-timer plugin should fire into your Claude Code session. The MCP server reads this file every minute. If an entry is due now (±2 min window), its prompt is pushed as a `<channel source="heartbeat" name="..." time="...">` event. Changes take effect on the **next tick** — no restart required.

---

## Format

Markdown table with four columns: **Zeit | Tage | Name | Prompt**.
The table must start with `| Zeit` — that's the parser anchor. Everything before/after the table is prose and is ignored.

### Spalte 1: Zeit

Either fixed times or an interval.

**Time-list**: `7:50`, `07:50`, or `7:00, 14:00, 19:00`. Each slot fires max once per day in a ±2 min window.

**Interval**: `every 40min`, `alle 2h`, `every 2d`. Minimum interval is 15 minutes.

### Spalte 2: Tage

Empty or `daily` or `*` = every day.

| Eingabe | Bedeutung |
|---|---|
| (empty) / `daily` / `*` | every day |
| `weekdays` | Mon-Fri |
| `weekend` | Sat+Sun |
| `monday`..`sunday` (or `mon`/`tue`/...) | one english weekday |
| `montag`..`sonntag` (or `mo`/`di`/...) | one german weekday |
| `mo, mi, fr` or `mon, wed, fri` | list of any weekdays |

Case-insensitive, language-mixing allowed.

### Spalte 3: Name

`[a-z0-9-]+`, unique per file.

### Spalte 4: Prompt

≥20 characters, single-line, **NO `|` characters** (table separator). Describes what Claude should do when this timer fires.

---

## Aktive Timer

| Zeit | Tage | Name | Prompt |
|------|------|------|--------|

<!--
Add your timers below the header row. Example:

| 09:00 | weekdays | morning-todos | Lies meine TODOs (context/TODOs.md) und nenne die drei wichtigsten fuer heute |
| every 2h | daily    | pause-nudge   | Frag mich kurz ob ich eine Pause gemacht habe |
| 18:00 | weekdays | wrap-up       | Tagesabschluss: was geschafft, was offen geblieben |
-->
