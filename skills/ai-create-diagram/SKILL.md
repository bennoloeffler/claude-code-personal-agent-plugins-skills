---
name: ai-create-diagram
description: Strukturen/Architektur/Flowcharts/Orgs/Sequences als SVG+PNG erzeugen via D2 (d2lang.com). Trigger bei 'create-diagram', 'mach ein diagramm', 'erzeuge flowchart', 'architektur-bild', 'org-chart', 'sequenzdiagramm', 'flow-diagram'. Claude schreibt die .d2-Quelle, kompiliert zu SVG+PNG, Source-File liegt neben Output (einbettbar in Folien, spaeter editierbar).
argument-hint: "<beschreibung> [--theme light|dark|grape] [--sketch] [--out NAME]"
---

# ai-create-diagram -- Diagramme mit D2

Zweck: Beschreibung → D2-Quelle → SVG + PNG. Klar, typografisch sauber, reproduzierbar. D2 (d2lang.com) ist ein modernes Diagramm-Tool mit sauberer Typo und Auto-Layout.

## Wann dieses Skill, wann was anderes?

| Ziel | Skill |
|------|-------|
| Architektur, Flow, Org-Chart, State-Machine, Sequence, ERD | **/ai-create-diagram** (D2) |
| Datenvisualisierung (Balken, Linien, Scatter, Donut) | Vega-Lite / Plotly |
| Foto/Illustration/Poster | /ai-create-image (OpenAI gpt-image-1) |
| Hand-drawn Whiteboard-Stil | Excalidraw oder D2-sketch (`--sketch`) |
| Mindmap aus Bulletlist | Markmap |

## Input

Claude bekommt eine Beschreibung wie:
- "Architektur: Client redet mit API-Server, API-Server nutzt Datenbank und Cache"
- "Flowchart fuer Lead-Prozess: Anfrage → Qualifikation → Angebot → Abschluss → Onboarding"
- "Sequenzdiagramm: Nutzer sendet Sprachnachricht → Bot → STT → LLM → Antwort"

## Ausfuehrung

```bash
# 1. Install-Check (idempotent, installiert nur was fehlt)
bash scripts/create_viz_install.sh

# 2. PATH setzen (d2 in ~/.local/bin, npm-globals in ~/.npm-global/bin)
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"

# 3. Ausgabe-Ordner
OUT_DIR="output/$(date +%Y-%m-%d)"
mkdir -p "$OUT_DIR"

# 4. D2-Quelle schreiben nach $OUT_DIR/<name>.d2
#    (Claude schreibt den Inhalt direkt via Write-Tool)

# 5. Kompilieren zu SVG + PNG
d2 --theme=1 --pad=40 "$OUT_DIR/<name>.d2" "$OUT_DIR/<name>.svg"
d2 --theme=1 --pad=40 "$OUT_DIR/<name>.d2" "$OUT_DIR/<name>.png"
```

Output-Konvention: `output/YYYY-MM-DD/<name>.{d2,svg,png}` -- die .d2-Quelle bleibt liegen, damit der User sie spaeter editieren oder per `d2` neu kompilieren kann.

## D2-Basis-Cheatsheet

```d2
# Nodes
user: User
api: API Server { shape: cylinder }
db: Database { shape: cylinder }

# Edges
user -> api: "request"
api -> db: "query"
db -> api: "result"

# Container (Subgraph)
backend: {
  api
  db
  api -> db: "query"
}

# Styles
api.style.fill: "#0b6bcb"
api.style.font-color: "#ffffff"
api.style.stroke-width: 2

# Layout-Hint
direction: right    # right | down | left | up
```

## Themes

| `--theme` | D2 `--theme=ID` | Farbe |
|-----------|-----------------|-------|
| `light` (default) | 0 | Neutral weiss, schwarz, blau |
| `grape` | 1 | Grape Soda: blau/violett |
| `dark` | 200 | Dark mode (Terminal) |

Direkt D2-Themen-IDs: https://d2lang.com/tour/themes

## Sketch-Modus

```bash
d2 --sketch --theme=1 input.d2 output.svg
```

`--sketch` gibt einen hand-drawn Look (aehnlich Excalidraw).

## Beispiel: typische Architektur-Diagramme

**Input**: "Web-App mit Backend und Datenbank"

**Claude schreibt** `output/YYYY-MM-DD/webapp-arch.d2`:

```d2
direction: right

user: "User" { shape: person }

frontend: "Web App" {
  shape: rectangle
  style.fill: "#0b6bcb"
  style.font-color: "#ffffff"
}

backend: "API Server" {
  shape: rectangle
}

db: "Database" {
  shape: cylinder
}

cache: "Cache" {
  shape: cylinder
  style.stroke-dash: 3
}

user -> frontend: "HTTPS"
frontend -> backend: "REST"
backend -> db: "SQL"
backend -> cache: "get/set"
```

**Dann**: `d2 webapp-arch.d2 webapp-arch.svg` -> fertig.

## Anti-Patterns

- **Keine Fake-Boxen** -- Claude nutzt echte D2-Syntax, keine ASCII-Art
- **Nicht mehr als 20 Nodes** -- sonst unlesbar. Lieber 2 Diagramme.
- **Farben sparsam** -- 1-2 Akzentfarben, Rest neutral.

## Fehlerfaelle

| Fehler | Fix |
|--------|-----|
| `d2: command not found` | `bash scripts/create_viz_install.sh` |
| Diagramm ueberlappt sich | `direction: right` oder `down` setzen, oder weniger Verbindungen |
| PNG zu klein/unscharf | `d2 ... --scale 2` oder SVG nehmen (skaliert verlustfrei) |

## Nicht enthalten

- Echte Excalidraw-Files (D2 `--sketch` ist ein Style-Approximation)
- Animationen (D2 kann static nur)
- Interaktive HTML (dafuer Vega-Lite / Plotly mit HTML-Output)

## Architektur

```
scripts/create_viz_install.sh               # gemeinsamer Installer (d2 + npm-Globals)
output/YYYY-MM-DD/<name>.d2                 # Quelle (Claude-Write)
output/YYYY-MM-DD/<name>.svg                # d2 output
output/YYYY-MM-DD/<name>.png                # d2 output
```
