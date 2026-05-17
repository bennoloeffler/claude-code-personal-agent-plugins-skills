---
name: ai-create-image
description: "Foto/Illustration/Poster via OpenAI gpt-image-1. Trigger bei 'create-image', 'erzeuge bild', 'mach ein bild', 'poster', 'illustration', 'generiere foto', 'produziere ein visual'. Schreibt PNG nach output/YYYY-MM-DD/."
argument-hint: "<prompt> [--size 1024x1024|1024x1536|1536x1024|auto] [--quality low|medium|high|auto] [--out NAME]"
---

# /ai-create-image -- Bilder via OpenAI gpt-image-1

Text-Prompt rein, PNG raus. gpt-image-1 ist der Nachfolger von DALL-E 3 -- besseres Text-Rendering, besserer Fotorealismus. Wrapper laeuft cross-platform ueber Node.

## Wann nutzen

- Heldenbild fuer Folie, Blog, Landing-Page
- Poster / Eventbild
- Editorial-Illustration zu einem Thema
- Schnelle Visualisierung einer Idee (Whiteboard-Ersatz)

## Voraussetzungen

- Node.js >= 18 (mit built-in `fetch`)
- OPENAI_API_KEY (Aufloesung siehe weiter unten)

Wird vom Preflight automatisch geprueft (inkl. Live-Test des Keys gegen `/v1/models`).

(`$SKILL` = Pfad zum Skill-Ordner, typisch `~/.claude/skills/ai-create-image`)

## Install-Gate (vor jedem Aufruf!)

```bash
# macOS/Linux:
if [ -f "$SKILL/SKILL_INSTALLED.md" ]; then
  : # OK
elif [ -f "$SKILL/SKILL_INSTALL_FAILED.md" ]; then
  cat "$SKILL/SKILL_INSTALL_FAILED.md"; exit 1
else
  bash "$SKILL/scripts/preflight.sh"
fi
```

```powershell
# Windows:
if (Test-Path "$SKILL\SKILL_INSTALLED.md") { }
elseif (Test-Path "$SKILL\SKILL_INSTALL_FAILED.md") { Get-Content "$SKILL\SKILL_INSTALL_FAILED.md"; exit 1 }
else { powershell -ExecutionPolicy Bypass -File "$SKILL\scripts\preflight.ps1" }
```

`bin/create-image.mjs` prueft den Gate ohnehin selbst -- bei fehlendem Marker verweigert es die Arbeit mit klarer Meldung.

## Ausfuehrung

```bash
node "$SKILL/bin/create-image.mjs" "DEIN PROMPT"
```

Output:
```
output/YYYY-MM-DD/<name>.png
output/YYYY-MM-DD/<name>.prompt.txt
```

Wrapper gibt JSON zurueck mit `png`, `prompt_file`, `size`, `quality`, `model`, `bytes`, `key_source`, `created_at`.

## Optionen

| Flag | Beschreibung | Default |
|------|-------------|---------|
| `--size SIZE` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | `1024x1024` |
| `--quality LEVEL` | `low`, `medium`, `high`, `auto` | `high` |
| `--out NAME` | Output-Dateiname (ohne `.png`) | `img-<HHMMSS>` |
| `--cwd DIR` | Basisverzeichnis -- Output landet in `<cwd>/output/YYYY-MM-DD/` | `process.cwd()` |
| `--model NAME` | Modell-Override | `gpt-image-1` |
| `-h`, `--help` | Hilfe | – |

## Size / Quality (Faustregeln)

| Size | Zweck | Kosten-Tendenz |
|------|-------|----------------|
| `1024x1024` | Square Post, Icon, Avatar | mittel |
| `1024x1536` | Portrait / Poster hochkant | hoeher |
| `1536x1024` | Landscape / Banner | hoeher |
| `auto` | Modell entscheidet | variabel |

| Quality | Nutzen |
|---------|--------|
| `low` | Schnell, Preview, Thumbnails |
| `medium` | Standard |
| `high` (Default) | Print, Folien, Heldenbild |
| `auto` | Modell entscheidet |

## API-Key-Reihenfolge

1. `~/.claude/.env/ai-create-image.env` -- Override pro Nutzer
2. `<skill>/config/secrets.default.env` -- shipped default (mitgeliefert)
3. `$OPENAI_API_KEY` -- Umgebungsvariable

Format:
```
OPENAI_API_KEY=sk-...
```

## Prompt-Tipps fuer gpt-image-1

- **Konkret**: Subjekt, Setting, Licht, Stil, Farbpalette, Blickwinkel
- **Text im Bild** funktioniert ordentlich (Posterschrift, Schilder); bei Logos vorsichtig
- **Fotorealistisch**: "professional photography, natural lighting, shallow depth of field, 50mm lens"
- **Illustration**: "editorial illustration, flat design, limited color palette (2-3 colors), clean lines"
- **Technical**: "technical illustration, engineering aesthetic, muted blues and greys, clear focal point"

## Beispiele

**Business-Heldenbild**

```bash
node "$SKILL/bin/create-image.mjs" --size 1536x1024 --out hero-team \
  "A team of consultants in a modern light-filled office, whiteboard with diagrams,
   warm natural light, documentary photography style, focus on collaboration,
   no faces visible clearly."
```

**Event-Poster**

```bash
node "$SKILL/bin/create-image.mjs" --size 1024x1536 --out lagerfeuer-poster \
  "Vintage-style event poster for 'Lagerfeuer 2026 - KI im Mittelstand',
   bold sans-serif typography, warm orange + dark teal color scheme,
   stylized illustration of a campfire with abstract neural network sparks,
   centered composition, A3 portrait aspect, editorial feel."
```

**Editorial-Illustration**

```bash
node "$SKILL/bin/create-image.mjs" --size 1536x1024 --quality high --out blog-system \
  "Editorial illustration, minimal flat vector style, two consultants looking at a giant
   interconnected system (gears + nodes + people), limited palette (#0b6bcb blue, #ea580c
   orange, soft grey), 3:2 aspect, clear focal point."
```

## Fehlerfaelle

**Erste Anlaufstelle:** `SKILL_INSTALL_FAILED.md` im Skill-Ordner (falls vorhanden).

| Symptom | Ursache | Loesung |
|---------|---------|---------|
| `ERROR: Skill noch nicht installiert` | Preflight nicht gelaufen | `bash "$SKILL/scripts/preflight.sh"` |
| `HTTP 401` | API-Key falsch / abgelaufen | `~/.claude/.env/ai-create-image.env` aktualisieren oder Skill-Default ersetzen |
| `HTTP 429` | Rate-Limit | 30 s warten, retry |
| `content_policy_violation` | Prompt enthaelt verbotenes Motiv | Umformulieren (Gewalt, reale Personen kompromittierend, medizinische Diagnosen) |
| `HTTP 500` | OpenAI-seitig | 1-2 min warten, retry |

Healthcheck (read-only):
```bash
node "$SKILL/scripts/doctor.mjs"
```

## Kosten

Pro Bild (grobe Hausnummern):

- `1024x1024` standard: $0.04 – 0.05
- `1024x1536` / `1536x1024`: $0.06 – 0.08
- `high` quality verdoppelt das in etwa.

Faustregel: 10 Iterationen = ca. 50 Cent.

## Anti-Patterns

- **Keine realen Personen ohne Einverstaendnis** erzeugen ("Kunde X im Portraitstil" -> nein).
- **Keine Logos** -- gpt-image-1 kann Marken-Logos nicht zuverlaessig reproduzieren. Dafuer Designer.
- **Nicht als "Foto von Fakt X" verkaufen** -- Bilder sind immer synthetisch.

## Architektur

```
~/.claude/.env/ai-create-image.env                       # API-Key Override (pro Nutzer)
$SKILL/config/secrets.default.env            # shipped default
<cwd>/output/YYYY-MM-DD/<name>.png           # Output
<cwd>/output/YYYY-MM-DD/<name>.prompt.txt    # verwendeter Prompt (Reproduzierbarkeit)
```

## Dokumentation

- OpenAI Images API: https://platform.openai.com/docs/guides/images
- gpt-image-1 Modell-Karte: https://platform.openai.com/docs/models/gpt-image-1
