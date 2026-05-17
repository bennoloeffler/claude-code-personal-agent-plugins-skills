# ai-create-image-set

Claude-Code-Skill: erzeugt einen **konsistenten Satz** von Bildern via OpenAI gpt-image-1 -- z.B. alle Hintergruende fuer ein Foliendeck mit einheitlicher Bildsprache.

## Was macht das Skill?

Du beschreibst einmal den **Stil-Anker** (oder waehlst eines der 5 Presets), listest dann **alle Slots** mit ihren Motiv-Prompts in einer JSON-Datei auf. Das Skill ruft gpt-image-1 parallel auf und legt fuer jeden Slot ein PNG + Begleitdatei ab.

Im Unterschied zu `ai-create-image` (Einzelbild) optimiert dieses Skill fuer **Serien** mit einheitlicher Optik.

## Installation

```bash
# macOS/Linux
cp -R ai-create-image-set ~/.claude/skills/
bash ~/.claude/skills/ai-create-image-set/scripts/preflight.sh
```

```powershell
# Windows
Copy-Item -Recurse ai-create-image-set $env:USERPROFILE\.claude\skills\
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\ai-create-image-set\scripts\preflight.ps1"
```

Oder one-shot:
```bash
bash ai-create-image-set/scripts/install-macos.sh
```

## Quick start

1. Slot-Datei anlegen (Vorlage: `resources/slots.example.json`):

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

2. Aufrufen:
```bash
node ~/.claude/skills/ai-create-image-set/bin/create-image-set.mjs --slots my-slots.json
```

3. Ergebnis: `<out_dir>/<slot>.png` + `.prompt.txt` pro Slot. Existierende PNGs werden uebersprungen.

## API-Key

Reihenfolge:
1. `~/.claude/.env/ai-create-image-set.env`
2. `<skill>/config/secrets.default.env` (shipped default)
3. `$OPENAI_API_KEY`

## Healthcheck

```bash
node ~/.claude/skills/ai-create-image-set/scripts/doctor.mjs
```

## Datei-Uebersicht

```
ai-create-image-set/
├── SKILL.md
├── README.md
├── SKILL_INSTALLED.md            (zur Laufzeit erstellt)
├── SKILL_INSTALL_FAILED.md       (zur Laufzeit erstellt, nur bei Fehler)
├── bin/create-image-set.mjs      # Wrapper (Gate + parallele Generierung)
├── scripts/
│   ├── preflight.sh / preflight.ps1 / preflight-core.mjs
│   ├── doctor.mjs
│   └── install-macos.sh / install-windows.ps1
├── config/secrets.default.env
└── resources/
    ├── style-presets.json        # 5 eingebaute Stil-Anker
    └── slots.example.json        # Beispiel-Slot-Datei
```

## Bei Problemen

1. `SKILL_INSTALL_FAILED.md` im Skill-Ordner lesen.
2. Doctor laufen lassen.
3. `--dry-run` zeigt was getan wuerde ohne API-Calls.
4. Issue im Repo melden.
