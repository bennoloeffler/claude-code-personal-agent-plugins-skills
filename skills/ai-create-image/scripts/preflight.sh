#!/usr/bin/env bash
# ai-create-image preflight bootstrap (macOS/Linux)
# Verantwortlich nur fuer: Gate-Check + Node bereitstellen.
# Der eigentliche Check + Install passiert in scripts/preflight-core.mjs.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLED="$SKILL_DIR/SKILL_INSTALLED.md"
FAILED="$SKILL_DIR/SKILL_INSTALL_FAILED.md"
SKILL_NAME="ai-create-image"

say()  { printf "%s\n" "$1"; }
step() { printf "\n==> %s\n" "$1"; }
ok()   { printf "    OK   %s\n" "$1"; }
warn() { printf "    WARN %s\n" "$1"; }
fail() { printf "    FAIL %s\n" "$1" >&2; }

write_failed() {
  cat > "$FAILED" <<EOF
# ${SKILL_NAME}: SKILL_INSTALL_FAILED

**Geschrieben:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Plattform:** $(uname -a)
**Skill-Ordner:** ${SKILL_DIR}
**Phase:** Bootstrap (Node.js)

## Status: FAILED

$1

## Naechste Schritte

$2

---
Nach Behebung: SKILL_INSTALL_FAILED.md loeschen und Preflight erneut starten:
\`bash "$SCRIPT_DIR/preflight.sh"\`
EOF
}

# --- Gate ---
if [ -f "$INSTALLED" ]; then
  say "Skill ist bereits installiert: $INSTALLED"
  say "(Loeschen, um Preflight erneut zu starten.)"
  exit 0
fi
if [ -f "$FAILED" ]; then
  say "Frueherer Preflight ist fehlgeschlagen. Inhalt von SKILL_INSTALL_FAILED.md:"
  say "----------"
  cat "$FAILED"
  say "----------"
  say ""
  say "Bitte Ursache beheben und SKILL_INSTALL_FAILED.md loeschen, dann erneut:"
  say "  bash \"$SCRIPT_DIR/preflight.sh\""
  exit 1
fi

step "${SKILL_NAME} preflight bootstrap (macOS/Linux)"
say "Skill: $SKILL_DIR"

# --- Bootstrap: Node ---
step "Bootstrap: Node.js"
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version)"
  NODE_MAJOR="$(echo "$NODE_VER" | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
    ok "Node $NODE_VER (>= v18) gefunden"
  else
    fail "Node $NODE_VER zu alt -- mindestens v18 noetig"
    write_failed \
      "Node.js Version $NODE_VER ist zu alt (mindestens v18 erforderlich)." \
      "Aktualisiere Node: \`brew upgrade node\` oder von https://nodejs.org/."
    exit 1
  fi
else
  warn "Node nicht gefunden -- versuche Installation..."
  if command -v brew >/dev/null 2>&1; then
    say "    Homebrew gefunden -- \`brew install node\` (dauert 1-3 Minuten)..."
    if brew install node; then
      ok "Node installiert: $(node --version)"
    else
      fail "brew install node fehlgeschlagen"
      write_failed \
        "\`brew install node\` ist mit einem Fehler abgebrochen." \
        "Bitte Node manuell installieren: \`brew install node\` (siehe brew-Output) oder von https://nodejs.org/."
      exit 1
    fi
  else
    fail "Weder Node noch Homebrew vorhanden"
    write_failed \
      "Auf diesem System ist weder Node.js noch Homebrew installiert." \
      "Bitte installiere zuerst Homebrew (https://brew.sh), dann \`brew install node\`. Alternativ Node direkt von https://nodejs.org/."
    exit 1
  fi
fi

# --- Detail-Preflight ---
step "Detail-Preflight (OPENAI_API_KEY)"
node "$SKILL_DIR/scripts/preflight-core.mjs"
exit $?
