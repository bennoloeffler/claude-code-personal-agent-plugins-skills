---
name: ai-timer
description: Use when the user wants to add, change, rename, or delete a recurring Heartbeat-Timer in timer.md via natural language. Triggers include "erinner mich", "mach einen Timer", "baue Timer", "aendere Timer X", "setze X auf", "verschiebe X auf", "loesche Timer X", "add/update/delete timer", "jeden X um Y mach Z", "alle N Minuten/Stunden/Tage". Parses umgangssprachliche Beschreibung into a valid `| Zeit | Tage | Name | Prompt |` row (for add) or an Edit on the existing row (for update/delete), validates via `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"`, and auto-corrects until green.
argument-hint: "jeden werktag 18:00 tagesabschluss" | "aendere morgen-check auf 8:00" | "loesche pulse-work"
---

# timer: Timer per Umgangssprache anlegen, aendern, loeschen

Ziel: the user sagt einen Satz -- das Skill macht daraus die richtige Operation in `timer.md` und validiert. Drei Modi:

| Intent | Beispiele | Abschnitt |
|--------|-----------|-----------|
| **ADD** | "erinner mich jeden Werktag um 18 Uhr an X", "baue Timer Y" | [ADD](#add-neuen-timer-anlegen) |
| **UPDATE** | "aendere morgen-check auf 8:00", "setze pulse-work auf every 30min", "verschiebe team-briefing auf Samstag", "benenne X um in Y", "aendere Prompt von X zu ..." | [UPDATE](#update-bestehenden-timer-aendern) |
| **DELETE** | "loesche Timer X", "entferne pulse-work", "kill team-briefing" | [DELETE](#delete-timer-loeschen) |

## Pflicht-Vorflug: Erstinstallation pruefen

**Vor jeder ADD/UPDATE/DELETE-Operation** einmal kurz pruefen, ob die Heartbeat-Pipeline aktiviert ist. Ohne Channel-Flag tickt der Server, schreibt Log, feuert -- und Claude bekommt **nichts** davon mit. Reine "timer.md eingetragen"-Bestaetigung waere irrefuehrend.

### Onboarding-Detektor

Lies still (nicht reporten) folgende Signale aus dem **Projekt-Root** (`pwd`):

| Signal | Wert |
|--------|------|
| `.ai-heartbeat-timer/heartbeat.log` existiert? | ja/nein |
| `.ai-heartbeat-timer/state.json` existiert? | ja/nein |
| `timer.md` existiert? | ja/nein |
| System-Reminder-Block `## plugin:ai-heartbeat-timer:heartbeat` in dieser Session? | ja/nein (Indikator dass Channel-Flag gesetzt ist) |

**Onboarding-Modus** ausloesen wenn ALLE drei zutreffen:
- `.ai-heartbeat-timer/heartbeat.log` fehlt **und**
- `.ai-heartbeat-timer/state.json` fehlt **und**
- (`timer.md` fehlt **oder** Channel-Reminder-Block fehlt in der Session)

Andernfalls direkt zum Intent-Block weiter unten springen.

### Onboarding-Ausgabe (bei Erstinstallation)

Zeige **vor** der Bearbeitung der User-Anfrage genau diese Sequenz (deutsch, knapp, kein Smalltalk):

```
Heartbeat-Timer ist neu in diesem Projekt. Drei Dinge musst du machen, sonst
feuert kein einziger Timer (silent failure):

1) timer.md anlegen
   cp "$(claude plugin root ai-heartbeat-timer)/templates/timer.md" ./timer.md

2) Claude Code mit Channel-Flag starten -- ohne das verwirft Claude
   alle Heartbeat-Notifications. Beende diese Session und starte neu:
   claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins
   (plus deine ueblichen Flags wie --dangerously-skip-permissions)

   Permanent als Alias in ~/.zshrc:
     alias claude-heartbeat='claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins --dangerously-skip-permissions'

3) Bei claude.ai eingeloggt sein (/login). Channels brauchen OAuth-Token,
   API-Key allein reicht nicht.

Verifikation: Nach dem Neustart sollte in den System-Remindern dieser
Session ein Block `## plugin:ai-heartbeat-timer:heartbeat` auftauchen. Wenn ja:
Channel ist aktiv, Timer feuern.

Volle Doku + Troubleshooting:
   $(claude plugin root ai-heartbeat-timer)/README.md

Ich kann jetzt trotzdem deinen Timer in timer.md eintragen -- er feuert
dann, sobald du mit der richtigen Kommandozeile neu startest. Soll ich?
```

Wenn der User **bestaetigt** ("ja", "mach", "klar"): weiter zum Intent-Block (ADD/UPDATE/DELETE) -- aber am Ende der Bestaetigung explizit anmerken: "Wirksam ab Neustart mit Channel-Flag, siehe oben."

Wenn der User **ablehnt** oder erst die Aktivierung machen will: nichts an `timer.md` aendern, kurz bestaetigen "OK, wir machen weiter sobald du neugestartet hast."

### Teil-Setup-Modus (timer.md da, aber Channel inaktiv)

Wenn `timer.md` existiert, aber der Channel-Reminder-Block fehlt in der Session: **kurze** Warnung (eine Zeile) vor der Bestaetigung am Ende:

```
⚠ Channel-Flag fehlt in dieser Session. Timer landet in timer.md, feuert
aber erst nach Neustart mit:
  claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins
```

Dann normal weiterarbeiten.

## Intent-Erkennung

Zuerst aus der Eingabe den Intent bestimmen:

1. Enthaelt die Eingabe Worte wie **aendere / change / setze ... auf / update / verschiebe / benenne um / rename**? → **UPDATE**
2. Enthaelt sie **loesche / entferne / delete / remove / kill / weg mit**? → **DELETE**
3. Sonst → **ADD**

Fuer UPDATE und DELETE **muss** ein existierender Timer-Name genannt oder eindeutig ableitbar sein:
- Exact match zuerst (`morgen-check` steht so in `timer.md`)
- Fuzzy fallback: case-insensitive substring match (`morgencheck` → `morgen-check`)
- Keine eindeutige Zuordnung → **eine** Rueckfrage mit Kandidaten-Liste aus `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts" --verbose`

---

## ADD: neuen Timer anlegen

### 1. Eingabe parsen

Extrahiere aus der Beschreibung vier Felder. Wenn etwas unklar ist, **genau eine** Rueckfrage stellen (nicht eine Liste, nicht iterativ) und dann weitermachen.

**Zeit** -- welche Variante:
- Zeitpunkt(e): `18:00`, `07:00, 14:00, 19:00`
- Intervall: `every 40min`, `alle 2h`, `every 2d`

Erkennungsmuster (Beispiele):
- "um 18 Uhr" / "18:00" / "6 abends" → `18:00`
- "morgens um 7, mittags um 14 und abends um 19" → `07:00, 14:00, 19:00`
- "alle 40 Minuten" / "every 40 min" → `every 40min`
- "alle 2 Stunden" → `every 2h`
- "alle zwei Tage" / "jeden zweiten Tag" → `every 2d`
- "jede Stunde" → `every 1h` (wenn <15min Gefahr besteht, frag nach)

**Tage** -- welche:
- "jeden Tag" / "taeglich" / nix genannt → **leer** (= daily)
- "werktags" / "Mo-Fr" → `weekdays`
- "am Wochenende" / "Sa und So" → `weekend`
- "jeden Montag und Mittwoch" → `mo, mi` (oder `monday, wednesday`)
- "jeden Sonntag" → `sunday`

Default bei nicht genanntem Tag: **leer** (`daily`). **Nicht** nachfragen.

**Name** -- leite aus dem Verb/Thema ab, nicht aus der Zeit:
- "Tagesabschluss" → `tagesabschluss`
- "Pulse check" → `pulse-check`
- "Erinner an Emails" → `email-reminder` oder `email-check`

Regel: `[a-z0-9-]+`, Kleinbuchstaben, Bindestriche statt Leerzeichen. Bei Konflikt mit existierendem Namen in `timer.md`: Suffix `-2`, `-3`, ... anhaengen **ohne** Rueckfrage.

**Prompt** -- formuliere einen handlungsorientierten Auftrag fuer Claude:
- ≥20 Zeichen
- Einzeilig (Newlines raus)
- Kein `|` (durch Komma/Klammer ersetzen)
- Sollte konkret sagen was Claude tun soll, nicht nur "Erinner an X"
- Example: user says "remind me to wrap up the day" → Prompt: `End-of-day: Ask the user how today went (what was finished, what is still open). Record open items in context/TODOs.md.`

### 2. Zeile zusammenbauen

Format exakt:
```
| <Zeit> | <Tage> | <Name> | <Prompt> |
```

Einfuegen in `timer.md` im Abschnitt "## Aktive Timer" -- **hinter** der letzten bestehenden Timer-Zeile, vor einer eventuellen Leerzeile oder Dateiende.

Nutze `Edit` mit dem letzten existierenden Timer als `old_string`-Anker und haenge die neue Zeile dahinter.

### 3. Validieren

```bash
bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"
```

**OK** (Exit 0) → weiter zu Schritt 5.
**FAIL** (Exit 1) → Schritt 4.

### 4. Auto-Korrektur

Lies die Fehlermeldungen. Typische Faelle:

| Fehler | Fix |
|--------|-----|
| `name '...' invalid (allowed: [a-z0-9-]+)` | Umlaute ersetzen (`ä`→`ae`), Gross→Klein, Underscore→Bindestrich. |
| `duplicate name` | Name-Suffix `-2` (oder hochzaehlen). |
| `hour 'N' out of range` | "19 Uhr abends" war als 19 gemeint, nicht 7. Re-parse und probiere 19:00. "Mittags" = 12:00. "Abends" = 18-20. Wenn immer noch ambig: **eine** Rueckfrage. |
| `prompt only N chars` | Prompt war zu kurz (oft weil Pipe drin war und abgeschnitten hat). Pipe entfernen, ausfuehrlicher formulieren. |
| `interval Nmin too short` | User wollte <15min. Sag ihm: "Min 15min erlaubt -- nehme ich `every 15min`?" und mach weiter mit 15min. |
| `unknown day 'X'` | Tippfehler oder Uebersetzungsluecke (z.B. `tuesdag`). Versuche Kurzform (`di`) oder nachfragen wenn wirklich unklar. |
| `duplicate time in time list` | User hat Zeit doppelt genannt. Dedupen. |
| `row has N columns` | Pipe-Zeichen im Prompt. Durch Komma/Semikolon ersetzen. |

**Maximal 2 Auto-Korrektur-Runden.** Wenn danach immer noch FAIL: Zeile wieder raus-editieren, an the user Bescheid geben mit konkretem Fehler und Vorschlag.

### 5. Bestaetigung an the user

Kurz, eine Zeile plus die neue Tabellen-Zeile:

```
Timer eingetragen:
| <Zeit> | <Tage> | <Name> | <Prompt> |

Wirkt beim naechsten Minuten-Tick, feuert erstmals <wann konkret>.
```

"Wann konkret" = erstes Fire-Fenster berechnen:
- Time-List: naechster passender Slot an aktivem Tag
- Intervall: sofort am naechsten aktiven Tick (bei daily: in ≤1min)

---

## UPDATE: bestehenden Timer aendern

### 1. Timer identifizieren

Lies `timer.md` und extrahiere den Tabellen-Abschnitt "## Aktive Timer".

Suche nach dem Ziel-Timer-Namen:
1. **Exact match** auf `name` in der Tabelle
2. **Fuzzy fallback** (case-insensitive, Bindestrich-tolerant): `morgencheck` → `morgen-check`, `Morgen Check` → `morgen-check`
3. **Nicht gefunden** → `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts" --verbose` aufrufen, kanonische Liste der existierenden Namen zeigen, **eine** Rueckfrage: "Meintest du einen davon?"

### 2. Felder parsen -- welche aendern sich?

Aus der Eingabe die Delta extrahieren. Moegliche Felder: `zeit`, `tage`, `name`, `prompt`. Meist wird **nur eins** geaendert.

Sprachmuster:
| Muster | Bedeutet |
|--------|----------|
| "aendere X auf 8:00" / "setze X auf 8:00" / "verschiebe X auf 8:00" | `zeit = 08:00` |
| "X auf every 30min" / "setze X auf alle 2h" | Zeit wird zu Intervall |
| "X laeuft ab jetzt nur werktags" / "aendere X auf weekdays" | `tage = weekdays` |
| "aendere X auf Do und Fr" | `tage = do, fr` |
| "benenne X um in Y" / "rename X to Y" | `name = Y` |
| "aendere Prompt von X zu ..." / "setze Prompt von X auf ..." | `prompt = ...` |

**Namens-Aenderung**: Der Name ist Identitaet im State-File. Bei Rename MUSS der State mitgenommen werden -- sonst sieht der neue Name "frisch" aus und ein gerade gefeuertes Intervall feuert sofort nochmal. → siehe Schritt 3a unten.

**Kind-Switch** (time-list ↔ interval): Wenn der Timer heute schon gefeuert hat und auf das andere Schedule-Kind umgestellt wird, muss der State angepasst werden damit nicht sofort nochmal gefeuert wird. → siehe Schritt 3a unten.

**Mehrere Felder gleichzeitig**: Wenn the user "setze X auf Di 9:00" sagt → Zeit UND Tag.

Unveraenderte Felder bleiben **exakt so** wie in der Datei (inkl. Whitespace und Tabelle-Padding nicht veraendern -- Edit ersetzt immer die ganze Zeile).

### 3. Zeile neu bauen und ersetzen

Neue Zeile: `| <neu-oder-alt Zeit> | <...> | <...> | <...> |`

Nutze `Edit`-Tool mit:
- `old_string` = die **komplette alte Tabellenzeile** (exakter Text, inkl. Whitespace). Lies dafuer `timer.md` und kopiere die Zeile verbatim.
- `new_string` = die neue Zeile mit gleichem Separator-Stil.

Nur diese eine Zeile anfassen -- nichts anderes in `timer.md`.

### 3a. State anpassen (nur bei Rename oder Kind-Switch)

Der Runtime matched State per Name. Wenn sich der Name oder das Schedule-Kind aendert, muss `.ai-heartbeat-timer/state.json` nachgezogen werden -- sonst gibt's ueberraschende Doppel-Fires.

Bedingungen + Befehle:

| Aenderung | Befehl |
|-----------|--------|
| Rename (Name alt → Name neu) | `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" rename <old> <new>` |
| Kind-Switch time-list → interval, Timer hat heute gefeuert | `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" touch <name>` -- setzt `lastFire` auf jetzt, damit das neue Intervall ab jetzt zaehlt |
| Kind-Switch interval → time-list | kein State-Command noetig (neue firedToday-Pruefung ist leer, lastFire bleibt orphan aber inert) |
| Nur Zeit/Tage/Prompt geaendert, kein Name/Kind-Wechsel | kein State-Command noetig |

**Wie erkennen "Timer hat heute gefeuert"** vor dem Switch:
```bash
bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" show
```
Wenn in `firedToday.<name>` irgendwas drin steht ODER `lastFire.<name>` heute gesetzt wurde → heute ist gefeuert, also `touch` noetig beim Kind-Switch.

### 4. Validieren + Auto-Korrektur

`bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"`. Bei FAIL: gleiche Fix-Tabelle wie im ADD-Flow (Schritt 4 oben) benutzen. Maximal 2 Runden.

**Wenn Auto-Korrektur versagt**: Alte Zeile per Edit wiederherstellen (also erneut tauschen, new_string ← original). the user sagen was nicht geht + Vorschlag.

### 5. Bestaetigung

```
Timer 'X' aktualisiert:
  vorher: | 07:00 | weekdays | morgen-check | ... |
  nachher: | 08:00 | weekdays | morgen-check | ... |

Wirkt beim naechsten Minuten-Tick.
```

Bei Rename oder Kind-Switch: zusaetzlich erwaehnen was mit dem State passiert ist, z.B. "State migriert: `<old>` → `<new>`" oder "lastFire auf jetzt gesetzt, naechster Fire in ~30min".

---

## DELETE: Timer loeschen

### 1. Timer identifizieren

Wie in UPDATE Schritt 1: exact → fuzzy → Rueckfrage bei Ambiguitaet.

### 2. Zeile entfernen

`Edit` mit:
- `old_string` = `\n` + komplette alte Tabellenzeile (inkl. fuehrendem Newline, damit keine Leerzeile zurueckbleibt)
- `new_string` = `` (leer)

Nur diese Zeile. Keine anderen Aenderungen.

### 3. State aufraeumen (immer machen)

```bash
bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" delete <name>
```

**Warum**: wird der Timer spaeter mit gleichem Namen und gleichem Slot wieder angelegt, darf der Runtime nicht denken "der hat heute schon gefeuert, suppress". Ohne diesen Schritt bliebe `firedToday[name]` bzw. `lastFire[name]` stale im State-File.

### 4. Validieren

`bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"` -- sollte gruen bleiben (weniger Timer).

### 5. Bestaetigung

```
Timer 'X' geloescht, State bereinigt.
Noch aktiv: N Timer.
```

---

## Beispiele

### Beispiel 1: Einfach
**User**: `/ai-timer jeden werktag 9 uhr check emails`

**Parsing**:
- Zeit: `09:00`
- Tage: `weekdays`
- Name: `email-check` (aus "check emails")
- Prompt: `Email-Check: Read new emails from the last 24h, flag anything urgent, ask the user about anything unclear.`

**Zeile**: `| 09:00 | weekdays | email-check | Email-Check: Lies neue Emails der letzten 24h ... |`

### Beispiel 2: Intervall
**User**: `/ai-timer alle 2h mich fragen ob ich pause mache`

**Parsing**:
- Zeit: `every 2h`
- Tage: *(leer, default daily)*
- Name: `pause-nudge`
- Prompt: `Pause-Nudge: Ask the user whether they took a break in the last 2h. If not: a short, friendly reminder — not pushy.`

### Beispiel 3: Multi-Zeit
**User**: `/ai-timer morgens, mittags, abends kalender check`

**Parsing**:
- Zeit: `08:00, 12:00, 18:00` (morgens/mittags/abends sind ambig; waehle konservativ, erklaer im Output)
- Tage: *(leer)*
- Name: `kalender-check`
- Prompt: `Calendar-Check: Scan today + tomorrow's calendar, name the next appointment and what needs preparing.`

### Beispiel 4: Fehler + Fix
**User**: `/ai-timer alle 5 min ping`

**Parsing**: `every 5min` -- aber <15min.
**Reaktion**: Nicht validieren, direkt sagen: "Min-Intervall 15 Minuten (sonst laeuft Claude ueber). Ich nehme `every 15min` -- OK?" und bei "OK"/keinem Einspruch: mit 15min weitermachen.

### Beispiel 5: Kollision
**User**: `/ai-timer jeden morgen 7 uhr tagescheck` aber `morgen-check` existiert schon mit 07:00 weekdays.

**Reaktion**: Name-Suffix. `morgen-check-2`. Keine Rueckfrage, the user kann umbenennen wenn er will.

### Beispiel 6: UPDATE -- Zeit aendern
**User**: `aendere timer morgen-check auf 8:00`

**Intent**: UPDATE (Signal: "aendere ... auf").
**Ziel**: `morgen-check` -- exact match vorhanden.
**Delta**: nur Zeit → `08:00`. Tage/Name/Prompt bleiben.

**Aktion**:
1. Lies `timer.md`, finde Zeile mit `morgen-check`.
2. `Edit` mit old_string = komplette alte Zeile, new_string = gleiche Zeile mit `07:00` → `08:00`.
3. `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"` → OK.
4. Bestaetigung:

```
Timer 'morgen-check' aktualisiert:
  vorher: | 07:00 | weekdays | morgen-check | Morgen-Check: (1) Lies context/TODOs.md ... |
  nachher: | 08:00 | weekdays | morgen-check | Morgen-Check: (1) Lies context/TODOs.md ... |

Wirkt beim naechsten Minuten-Tick. Feuert heute erstmals morgen 08:00 -- falls der Timer heute schon gefeuert hat, bleibt er heute ruhig (State-File).
```

### Beispiel 7: UPDATE -- Tage + Zeit
**User**: `setze team-briefing auf samstag 10:00`

**Intent**: UPDATE. Ziel: `team-briefing`. Delta: Zeit=`10:00`, Tage=`saturday`.

### Beispiel 8: UPDATE -- Rename
**User**: `benenne pulse-work um in focus-pulse`

**Intent**: UPDATE. Delta: Name.
**Schritte**:
1. Zeile in timer.md: `pulse-work` → `focus-pulse`
2. `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" rename pulse-work focus-pulse` -- nimmt firedToday/lastFire mit
3. Validieren
4. Bestaetigung: "Timer umbenannt. State migriert (lastFire/firedToday)."

Ohne den state-rename wuerde `focus-pulse` als "frischer" Timer gesehen und bei Intervallen sofort feuern -- Doppelfire kurz nach Rename.

### Beispiel 9: UPDATE -- nicht gefunden
**User**: `aendere morgencheck auf 9:00`

**Fuzzy match**: `morgencheck` → `morgen-check` (eindeutig, nur eine Kandidatin). Direkt weitermachen ohne Rueckfrage.

### Beispiel 10: UPDATE -- ambig
**User**: `aendere pulse auf 15min` -- es gibt `pulse-work` und `pulse-2h`.

**Reaktion**: Liste zeigen (aus `validate.ts --verbose`), genau eine Rueckfrage: "Welchen? `pulse-work` oder `pulse-2h`?"

### Beispiel 11: DELETE
**User**: `loesche timer pulse-2h`

**Intent**: DELETE. Ziel: `pulse-2h`.

**Aktion**:
1. `Edit` mit old_string = `\n| <zeile mit pulse-2h> |`, new_string = `""`.
2. `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" delete pulse-2h` -- entfernt State-Spuren.
3. `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"` → OK.
4. Bestaetigung: `Timer 'pulse-2h' geloescht, State bereinigt. Noch aktiv: 4 Timer.`

### Beispiel 12: UPDATE -- Time-List → Interval nach heutigem Fire
**User**: Um 07:30 (nach Fire um 07:00): `aendere morgen-check auf every 2h`

**Intent**: UPDATE. Delta: Zeit `07:00` → `every 2h`. Kind-Switch!
**Check**: `bun state.ts show` zeigt `firedToday.morgen-check = ["07:00"]` → heute schon gefeuert.

**Aktion**:
1. Zeile in timer.md: Zeit von `07:00` auf `every 2h` aendern.
2. `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" touch morgen-check` -- setzt `lastFire` auf jetzt (07:31), damit das Intervall ab jetzt zaehlt.
3. Validieren.
4. Bestaetigung: "Umgestellt auf `every 2h`. lastFire auf jetzt gesetzt, naechster Fire ca. 09:31."

Ohne den `touch` wuerde Runtime sehen: kind=interval, lastFire leer → sofortiger Fire um 07:32, dann 09:32, ... statt 09:31.

## Gegen-Anzeigen (wann NICHT dieses Skill)

- User will alle **Timer anzeigen**: `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts" -v` reicht -- kein Skill noetig, nur der Befehl.
- User will eine **Einmal-Erinnerung** ("in 10 min sag mir bescheid"): Heartbeat kann das nicht (nur recurring). Weise the user drauf hin, schlage `CronCreate` mit `recurring: false` als Session-Alternative vor.
- User will eine **Sekunden-genaue Aktion**: Heartbeat hat Minuten-Aufloesung -- nicht geeignet.
- User will **State manuell ruecksetzen** ("timer X soll heute nochmal feuern"): `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/state.ts" delete <name>` raeumt `firedToday` + `lastFire` weg. Kein Skill noetig -- einfach den Befehl laufen lassen und bestaetigen.

## Invariants

Nach Abschluss muss gelten:
1. `bun "${CLAUDE_PLUGIN_ROOT}/mcp/heartbeat-channel/validate.ts"` ist grün
2. Bei **ADD**: neue Zeile im Abschnitt "## Aktive Timer"; Format exakt `| Zeit | Tage | Name | Prompt |`.
3. Bei **UPDATE**: genau eine Zeile geaendert; keine anderen Felder als die angefragten veraendert.
4. Bei **DELETE**: genau eine Zeile entfernt; keine Leerzeile zurueckgelassen.
5. Alle uebrigen Zeilen in `timer.md` unveraendert.
6. the user wurde genau einmal bestaetigt -- keine Nachfragen-Schleife.
