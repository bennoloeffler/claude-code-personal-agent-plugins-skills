---
name: ai-create-image-set
description: "Erzeugt einen konsistenten Satz Bilder (Slide-Hintergruende, Bildserien) via OpenAI gpt-image-1. Trigger bei 'Slide-Hintergrund', 'deck background', 'Folien-Bilder generieren', 'praesentations-Hintergruende', 'Hero-Bilder fuer Folien', 'Bildserie'. Nimmt eine Slot-Liste + gemeinsamen Stil-Anker, ruft parallel auf, schreibt PNGs."
argument-hint: "--slots <FILE.json> [--style PRESET] [--size 1536x1024] [--quality medium|high] [--out-dir DIR]"
---

# /ai-create-image-set -- konsistente Bildserie via gpt-image-1

Zweck: Eine ganze Folien-Serie (oder allgemeine Bildreihe) braucht **einheitliche Bildsprache**. Statt jedes Bild einzeln zu prompten, definierst du einmal einen Stil-Anker, listest alle Slots mit Motiv-Prompts auf, und das Skill ruft gpt-image-1 parallel auf. Jeder Slot bekommt den gleichen Stil-Anker an den Prompt gehaengt.

## Wann nutzen

- Mehrere Slide-Hintergruende fuer ein Deck
- Bildserie fuer Blog/Website mit konsistenter Optik
- Variationen eines Themas mit einheitlicher Bildsprache

Fuer Einzelbilder: siehe `/ai-create-image`.

## Voraussetzungen

- Node.js >= 18 (built-in `fetch`)
- OPENAI_API_KEY

Preflight prueft beides plus Live-Validierung gegen `/v1/models`.

(`$SKILL` = Pfad zum Skill-Ordner, typisch `~/.claude/skills/ai-create-image-set`)

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

Der Wrapper prueft den Gate selbst. Bei fehlendem Marker: Refusal mit klarer Anleitung.

## Slot-Datei

JSON-Datei mit Liste der zu erzeugenden Slots:

```json
{
  "style": "editorial-photo",
  "size": "1536x1024",
  "quality": "medium",
  "out_dir": "img/backgrounds/ai",
  "slots": [
    { "name": "bg-cover",   "prompt": "..." },
    { "name": "bg-closing", "prompt": "..." }
  ]
}
```

Mitgeliefertes Beispiel: `$SKILL/resources/slots.example.json`.

Felder:

| Feld | Pflicht | Beschreibung |
|------|---------|-------------|
| `slots` | ja | Array von `{name, prompt}`. `name` wird Dateiname (`<name>.png`). |
| `style` | nein | Preset-Name (siehe `--list-styles`) |
| `style_text` | nein | Freitext-Stilanker -- ueberschreibt `style` |
| `size` | nein | wie unten | 
| `quality` | nein | wie unten |
| `out_dir` | nein | wie unten |

Command-line-Flags ueberschreiben jeweils das JSON.

## Ausfuehrung

```bash
node "$SKILL/bin/create-image-set.mjs" --slots slots.json
```

Output:
```
<out_dir>/<slot>.png
<out_dir>/<slot>.prompt.txt
```

`out_dir` ist relativ zu `--cwd` (Default: aktuelles Verzeichnis).

Idempotent: existierende PNGs werden uebersprungen (`--force` ueberschreibt).

Bei Erfolg: JSON-Summary auf stdout mit `total`, `ok`, `fail`, `elapsed_s`, `results[]`.

## Optionen

| Flag | Beschreibung | Default |
|------|-------------|---------|
| `--slots FILE` | Slot-JSON | (Pflicht) |
| `--style NAME` | Style-Preset (siehe `--list-styles`) | aus JSON |
| `--style-text "..."` | Freitext-Stilanker | aus JSON |
| `--size SIZE` | `1024x1024` / `1024x1536` / `1536x1024` / `auto` | `1536x1024` |
| `--quality LEVEL` | `low` / `medium` / `high` / `auto` | `medium` |
| `--out-dir DIR` | Ausgabeordner (relativ zu `--cwd`) | `img/backgrounds/ai` |
| `--cwd DIR` | Basisverzeichnis | `process.cwd()` |
| `--concurrency N` | Parallele Requests | `4` |
| `--model NAME` | Modell-Override | `gpt-image-1` |
| `--force` | bestehende PNGs ueberschreiben | aus |
| `--dry-run` | Plan zeigen, keine API-Calls | aus |
| `--list-styles` | Style-Presets listen | – |
| `--show-style NAME` | Preset-Text drucken | – |
| `-h`, `--help` | Hilfe | – |

## Stil-Presets (mitgeliefert)

| Preset | Charakter |
|--------|-----------|
| `editorial-photo` (Default) | Documentary-Consulting-Vibe, gedaempft, Negativraum oben |
| `dark-cinematic` | moody, deep shadows, golden hour |
| `swiss-minimal` | high-key clean, lots of negative space |
| `hand-drawn-warmth` | soft pastel illustration, warm paper |
| `tech-noir` | deep blue/teal + ein Neon-Highlight |

`node "$SKILL/bin/create-image-set.mjs" --show-style dark-cinematic` druckt den vollen Text.

## Slot-Namens-Konvention ()

Beispiele aus Strategie-Decks:

```
bg-cover                 # Hero / Eroeffnungsfolie
bg-closing               # Abschluss-Folie
bg-{section}-{thema}     # z.B. bg-historie-lean, bg-zukunft-buch
```

Erlaubte Zeichen im Slot-Namen: `A-Za-z0-9._-`.

## Kosten / Geschwindigkeit

Faustregel (gpt-image-1):

| Quality | Size | $/Bild |
|---------|------|--------|
| medium | 1024x1024 | ~$0.02 |
| medium | 1536x1024 | ~$0.03 |
| high   | 1536x1024 | ~$0.08 |

Bei `--concurrency 4` und 16 Bildern à medium/1536x1024 ungefaehr 0.50 USD und 2 Minuten.

## Prompt-Tipps fuer Hintergruende

- **"no faces clearly visible"** -- sonst zieht das Gesicht Aufmerksamkeit vom Headline-Text
- **"negative space in upper third"** -- Platz fuer Headlines (oder via CSS-Gradient-Overlay)
- **"no text, no logos, no watermarks"** -- gpt-image-1 schreibt sonst gerne unsinnigen Text rein
- **Single Motiv** pro Slide funktioniert besser als komplexe Szenen
- **Vermeide "professional businessman"** -- generisch; lieber konkretes Setting

## Stil aendern (Reset)

1. Slot-JSON: `style` (oder `style_text`) anpassen
2. Alte PNGs entfernen: `trash <out_dir>/*.png` (oder `--force`)
3. Skill erneut laufen lassen

## Fehlerfaelle

**Erste Anlaufstelle:** `SKILL_INSTALL_FAILED.md` im Skill-Ordner (falls vorhanden).

| Symptom | Ursache | Loesung |
|---------|---------|---------|
| `ERROR: Skill noch nicht installiert` | Preflight nicht gelaufen | `bash "$SKILL/scripts/preflight.sh"` |
| `HTTP 401` | Key ungueltig/abgelaufen | `~/.claude/.env/ai-create-image-set.env` aktualisieren |
| `HTTP 429` | Rate-Limit | `--concurrency 2`, Pause, retry |
| `content_policy_violation` | Prompt mit verbotenem Motiv | Slot umformulieren |
| `HTTP 500` (vereinzelt) | OpenAI-seitig | Skill erneut starten -- skipt was schon da ist, generiert nur die Failed-Slots |
| Bilder uneinheitlich | Stil-Anker zu generisch | `style_text` schaerfen (Lichtbeschreibung, Palette praezisieren) |
| Text in Bildern | "no text, no watermarks, no signage" explizit in `style_text` |

Healthcheck (read-only):

```bash
node "$SKILL/scripts/doctor.mjs"
```

## Architektur

```
~/.claude/.env/ai-create-image-set.env                       # API-Key Override (pro Nutzer)
$SKILL/config/secrets.default.env            # shipped default
$SKILL/resources/style-presets.json          # eingebaute Stil-Anker
$SKILL/resources/slots.example.json          # Beispiel-Slot-Datei
<cwd>/<out_dir>/<slot>.png                   # Output
<cwd>/<out_dir>/<slot>.prompt.txt            # vollstaendiger Prompt + Stil
```
