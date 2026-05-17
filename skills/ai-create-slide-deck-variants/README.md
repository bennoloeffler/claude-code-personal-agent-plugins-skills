# ai-create-slide-deck-variants

Claude-Code-Skill: liefert eine von **10 HTML-Praesentations-Aesthetiken** (Reveal.js + WebSlides) als single-file HTML.

## Was macht das Skill?

Statt jedes Deck von Null zu bauen, listet das Skill 10 vordefinierte Aesthetiken auf (kinematisch dunkel, editorial, swiss-minimal, bold-typo, ...) und kopiert die passende Vorlage in dein Projekt. Inhalte ersetzen, Bilder einsetzen, fertig.

**Wichtig:** Mitgeliefert sind 6 fertige Vorlagen (01, 06-10). Die anderen 4 (02-05) sind dokumentiert aber als "zu bauen" markiert -- bei Bedarf bestehende kopieren und CSS/Schrift tauschen.

## Installation

```bash
# macOS/Linux
cp -R ai-create-slide-deck-variants ~/.claude/skills/
bash ~/.claude/skills/ai-create-slide-deck-variants/scripts/preflight.sh
```

```powershell
# Windows
Copy-Item -Recurse ai-create-slide-deck-variants $env:USERPROFILE\.claude\skills\
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\ai-create-slide-deck-variants\scripts\preflight.ps1"
```

Oder one-shot:
```bash
bash ai-create-slide-deck-variants/scripts/install-macos.sh
```

**Kein API-Key noetig.** Preflight prueft nur Node-Version und Vorlagen-Verzeichnis.

## Quick start

```bash
# 1. Varianten anzeigen
node ~/.claude/skills/ai-create-slide-deck-variants/bin/pick-template.mjs --list

# 2. Empfehlung holen
node ~/.claude/skills/ai-create-slide-deck-variants/bin/pick-template.mjs \
  --recommend "premium, dunkel, fotos tragen die story"

# 3. Variante kopieren
node ~/.claude/skills/ai-create-slide-deck-variants/bin/pick-template.mjs \
  --variant 06 --out my-deck.html

# 4. Datei oeffnen, Inhalte ersetzen, Browser
open my-deck.html
```

## Workflow zusammen mit anderen -Skills

```
ai-create-image-set    -- generiert Bilder fuer img/backgrounds/ai/bg-*.jpg
ai-create-slide-deck-variants  -- waehlt + kopiert Deck-Vorlage
ai-create-image (einzeln)      -- Heldenbild fuer Cover-Folie
```

Decks fallen auf Gradients zurueck wenn Bilder fehlen -- keine Crash-Sorgen.

## Datei-Uebersicht

```
ai-create-slide-deck-variants/
├── SKILL.md
├── README.md
├── SKILL_INSTALLED.md          (zur Laufzeit erstellt)
├── SKILL_INSTALL_FAILED.md     (zur Laufzeit erstellt, nur bei Fehler)
├── bin/pick-template.mjs       # Wrapper (Gate + list/recommend/copy)
├── scripts/
│   ├── preflight.sh / preflight.ps1 / preflight-core.mjs
│   ├── doctor.mjs
│   └── install-macos.sh / install-windows.ps1
└── templates/
    ├── _variants.json          # Index aller 10 Varianten + Metadaten
    ├── deck-01-revealjs-cinematic.html
    ├── deck-06-webslides-fullbleed.html
    ├── deck-07-webslides-split.html
    ├── deck-08-webslides-dark.html
    ├── deck-09-webslides-bold.html
    └── deck-10-webslides-minimal.html
```

## Healthcheck

```bash
node ~/.claude/skills/ai-create-slide-deck-variants/scripts/doctor.mjs
```

## Bei Problemen

1. `SKILL_INSTALL_FAILED.md` im Skill-Ordner lesen.
2. Doctor laufen lassen.
3. `--show ID` zeigt Details zu einer Variante.
4. Issue im Repo melden.
