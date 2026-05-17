# ai-create-image

Claude-Code-Skill: erzeugt Bilder via OpenAI gpt-image-1 (Nachfolger von DALL-E 3).

## Was macht das Skill?

Wenn du in Claude Code sagst *"erzeuge ein Bild von ..."* oder *"mach ein Poster fuer ..."*, schreibt der Wrapper aus deinem Prompt ein PNG nach `output/YYYY-MM-DD/<name>.png` -- mit Begleitdatei `.prompt.txt` fuer Reproduzierbarkeit.

## Installation

Drei Wege -- alle nutzen am Ende das Preflight-Skript, das fehlende Software prueft/installiert und einen Status-Marker schreibt.

### A) Mit Claude Marketplace

Skill installieren -> beim ersten Aufruf laeuft der Preflight automatisch.

### B) Per Hand kopieren

```bash
# macOS/Linux
cp -R ai-create-image ~/.claude/skills/
bash ~/.claude/skills/ai-create-image/scripts/preflight.sh
```

```powershell
# Windows
Copy-Item -Recurse ai-create-image $env:USERPROFILE\.claude\skills\
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\ai-create-image\scripts\preflight.ps1"
```

### C) One-Shot-Installer

```bash
bash ai-create-image/scripts/install-macos.sh        # macOS/Linux
powershell -ExecutionPolicy Bypass -File ai-create-image\scripts\install-windows.ps1   # Windows
```

## Was der Preflight macht

1. **Node.js >= 18** -- via `brew install node` / `winget install OpenJS.NodeJS.LTS`, falls fehlt
2. **OPENAI_API_KEY** -- pruefen ob aufloesbar (Override > Skill-Default > Umgebung)
3. **Live-Test** -- ein leichtgewichtiger `GET /v1/models`-Aufruf bestaetigt, dass der Key tatsaechlich funktioniert

Marker-Datei:
- `SKILL_INSTALLED.md` -- alles OK
- `SKILL_INSTALL_FAILED.md` -- mit Begruendung und Naechste-Schritte-Liste

## API-Key

Reihenfolge:

1. `~/.claude/.env/ai-create-image.env` (Override pro Nutzer) -- empfohlen
2. `config/secrets.default.env` im Skill (shipped default)
3. `$OPENAI_API_KEY`

Format:
```
OPENAI_API_KEY=sk-...
```

## Verwendung

In Claude Code einfach reden:

- *"erzeuge ein Bild von einem Lagerfeuer mit Funkenflug, abendliches Licht"*
- *"mach ein Poster fuer den 'Strategieworkshop 2026'"*
- *"editorial illustration fuer den Blog-Post ueber CCPM"*

## Healthcheck

```bash
node ~/.claude/skills/ai-create-image/scripts/doctor.mjs
```

## Datei-Uebersicht

```
ai-create-image/
├── SKILL.md                          # Skill-Definition fuer Claude
├── README.md                         # diese Datei
├── SKILL_INSTALLED.md                # (zur Laufzeit erstellt, Erfolg)
├── SKILL_INSTALL_FAILED.md           # (zur Laufzeit erstellt, Fehler)
├── bin/create-image.mjs              # Wrapper (Gate-Check + OpenAI Images API)
├── scripts/
│   ├── preflight.sh                  # Bash-Bootstrap (Node sichern)
│   ├── preflight.ps1                 # PowerShell-Bootstrap
│   ├── preflight-core.mjs            # eigentliche Checks (Key + Live-Test)
│   ├── doctor.mjs                    # read-only Healthcheck
│   ├── install-macos.sh              # One-Shot copy+preflight
│   └── install-windows.ps1           # One-Shot copy+preflight
└── config/
    └── secrets.default.env           # shipped default-API-Key
```

## Bei Problemen

1. `SKILL_INSTALL_FAILED.md` im Skill-Ordner lesen.
2. Doctor: `node ~/.claude/skills/ai-create-image/scripts/doctor.mjs`
3. Issue im Repo melden.
