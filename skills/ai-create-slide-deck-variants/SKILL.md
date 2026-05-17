---
name: ai-create-slide-deck-variants
description: "Liefert eine von 10 HTML-Praesentations-Aesthetiken (Reveal.js + WebSlides). Trigger bei 'Deck-Variante', 'HTML-Praesentation Variante', 'PowerPoint-Ersatz HTML', 'Strategie-Deck', 'Folien-Variante bauen', 'Reveal.js Folien', 'WebSlides Folien'. Single-file HTML, kein Build, kein npm. Vorlage kopieren, Inhalt einsetzen."
argument-hint: "--list | --variant ID --out FILE | --recommend 'was soll das Deck transportieren'"
---

# /ai-create-slide-deck-variants -- eine von 10 Deck-Aesthetiken

Zweck: Wenn du schon weisst (oder ausprobieren willst), **welche Aesthetik** dein Deck haben soll, kopiert das Skill eine fertige Vorlage in dein Projekt -- ohne dass du HTML/CSS von Hand baust.

Single-file HTML. Kein Build-Step. Kein npm. Reveal.js / WebSlides via CDN. Oeffnet lokal per Doppelklick.

## Wann nutzen

- Schnell ein Strategie- oder Workshop-Deck aufsetzen
- Beim Pitch-Vorbereiten verschiedene Stile probieren (eine Story -- drei Looks)
- Wenn jemand "PowerPoint-Ersatz" sagt, aber eigentlich was Eigenstaendiges meint

## Voraussetzungen

- Node.js >= 18

Kein API-Key noetig. Preflight prueft nur, ob die Vorlagen-Dateien vorhanden sind.

(`$SKILL` = Pfad zum Skill-Ordner, typisch `~/.claude/skills/ai-create-slide-deck-variants`)

## Install-Gate (vor jedem Aufruf!)

```bash
# macOS/Linux:
if   [ -f "$SKILL/SKILL_INSTALLED.md" ]; then :
elif [ -f "$SKILL/SKILL_INSTALL_FAILED.md" ]; then cat "$SKILL/SKILL_INSTALL_FAILED.md"; exit 1
else bash "$SKILL/scripts/preflight.sh"
fi
```

```powershell
# Windows:
if (Test-Path "$SKILL\SKILL_INSTALLED.md") { }
elseif (Test-Path "$SKILL\SKILL_INSTALL_FAILED.md") { Get-Content "$SKILL\SKILL_INSTALL_FAILED.md"; exit 1 }
else { powershell -ExecutionPolicy Bypass -File "$SKILL\scripts\preflight.ps1" }
```

Der Wrapper prueft den Gate selbst.

## Workflow

### 1. Varianten anzeigen

```bash
node "$SKILL/bin/pick-template.mjs" --list
```

### 2. Empfehlung holen (optional)

```bash
node "$SKILL/bin/pick-template.mjs" --recommend "premium, dunkel, fotos tragen die story"
```

Stichwort-Matching gibt 1-5 Top-Treffer mit Match-Score.

### 3. Variante kopieren

```bash
node "$SKILL/bin/pick-template.mjs" --variant 06 --out my-deck.html
```

Liefert JSON mit `template`, `out`, `next_steps`.

### 4. Inhalte ersetzen

Datei oeffnen und Platzhalter durch eigene Inhalte ersetzen. Falls die Vorlage Marken-, Produkt- oder Methodik-Begriffe enthaelt: diese verbatim erhalten und nicht "uebersetzen".

### 5. Bilder dazu (optional)

Verwendet das Schwester-Skill `ai-create-image-set` (gleiches Repo). Innerhalb von Claude Code per `${CLAUDE_SKILL_DIR}` aufloesen:

```bash
# Path-Aufloesung via Claude-Skill-Var (funktioniert egal wo die Skills installiert sind):
node "${CLAUDE_SKILL_DIR}/../ai-create-image-set/bin/create-image-set.mjs" --slots my-slots.json
```

Vorlagen referenzieren `img/backgrounds/ai/bg-*.jpg`. Fehlende Bilder -> Gradient-Fallback (kein Crash).

## Die 10 Varianten

| ID | Framework | Stil | Wann nutzen | Status |
|----|-----------|------|-------------|--------|
| 01 | Reveal.js | Cinematic Dark | Bilder tragen die Story | verfuegbar |
| 02 | Reveal.js | Editorial / Magazine | Tiefgang, Lesefluss | zu bauen |
| 03 | Reveal.js | Hausstil | Brand-Kohaerenz mit Agenda-Skill | zu bauen |
| 04 | Reveal.js | Asymmetric & Bold | Disruptiv, Statement | zu bauen |
| 05 | Reveal.js | Swiss Grid | Klarheit, Struktur | zu bauen |
| 06 | WebSlides | Full-bleed Cinematic | Vortrags-Atmosphaere | verfuegbar |
| 07 | WebSlides | Split-screen Editorial | Foto + Text gleichgewichtig | verfuegbar |
| 08 | WebSlides | Dark Cinematic | Premium-Premiere-Wirkung | verfuegbar |
| 09 | WebSlides | Bold Typography | Headlines als Hauptelement | verfuegbar |
| 10 | WebSlides | Minimal Editorial | Zurueckhaltung wirkt | verfuegbar |

Die "zu bauen"-Varianten sind dokumentiert, aber nicht als Vorlage mitgeliefert. Vorgehen: eine verfuegbare kopieren, CSS-Variablen + Schriften tauschen.

## Slot-System fuer Bilder

Decks referenzieren Hintergruende per Pfad:

```html
<section data-background-image="img/backgrounds/ai/bg-historie-lean.jpg">
```

Bilder kommen aus `/ai-create-image-set` -- gleiche Slot-Namens-Konvention:

```
bg-cover                  # Hero / Eroeffnung
bg-closing                # Abschluss
bg-{section}-{thema}      # z.B. bg-historie-lean, bg-zukunft-buch
```

## Optionen (bin/pick-template.mjs)

| Flag | Beschreibung |
|------|-------------|
| `--list` | Alle Varianten anzeigen |
| `--variant ID` | Variante per ID (z.B. 01, 06, 10) waehlen |
| `--out FILE` | Ziel-HTML-Pfad |
| `--force` | Ziel ueberschreiben |
| `--show ID` | Details einer Variante anzeigen (kein Kopieren) |
| `--recommend "..."` | Heuristische Empfehlung per Stichwort |
| `-h`, `--help` | Hilfe |

## Brand-Konventionen (gelten fuer alle Varianten)

- **Sprache:** je nach Vorlage. Templates sind primaer in deutsch — Inhalte ggf. in der Sprache des Decks belassen.
- **Marken-, Produkt- und Methodik-Begriffe verbatim erhalten** und nicht "uebersetzen". Konkrete Begriffe kommen aus der jeweiligen Vorlage / dem jeweiligen Projekt — nicht hartcodieren.
- **Logo** aus `img/logos/logo--square.png` (PNG mit Transparenz), falls vorhanden.
- Kein Datum/Quelle im HTML -- gehoert ins Dateinamen-Suffix

## Fehlerfaelle

| Symptom | Ursache | Loesung |
|---------|---------|---------|
| `ERROR: Skill noch nicht installiert` | Preflight nicht gelaufen | `bash "$SKILL/scripts/preflight.sh"` |
| `Variante X ist als "zu bauen"` | nicht-verfuegbare Variante gewaehlt | `--list` und verfuegbare nehmen |
| `Ziel existiert` | Out-Datei vorhanden | `--force` oder anderen `--out` waehlen |
| Bilder fehlen im Browser | `img/backgrounds/ai/bg-*.jpg` nicht da | `/ai-create-image-set` aufrufen, oder Gradient-Fallback akzeptieren |

Healthcheck:

```bash
node "$SKILL/scripts/doctor.mjs"
```

## Architektur

```
$SKILL/templates/_variants.json              # Index aller 10 Varianten
$SKILL/templates/deck-NN-*.html              # Vorlage-HTML-Dateien
<projekt>/<out>.html                          # Kopie ins Projekt
<projekt>/img/...                             # Vom Projekt erwartet (Bilder, Logo)
```

## Wenn du eine 11. Variante bauen willst

1. Vorlage einer existierenden Variante kopieren in `templates/deck-11-...html`
2. CSS-Variablen, Schriften, Layout-Logik tauschen
3. Eintrag in `templates/_variants.json` ergaenzen (`available: true`, neuer `id`, `file`, `framework`, `style`, `when`)
4. Preflight neu laufen lassen (`SKILL_INSTALLED.md` loeschen, dann erneut)

Die HTML-Struktur ist ueber alle Varianten aehnlich (Cover, TOC, Content-Folien, Closing). Wirklicher Unterschied: Typografie + Farbpalette + Layout-Asymmetrie.
