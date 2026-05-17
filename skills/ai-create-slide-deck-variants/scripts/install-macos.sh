#!/usr/bin/env bash
# ai-create-slide-deck-variants -- One-Shot-Installer fuer macOS/Linux
# Kopiert das Skill nach ~/.claude/skills/ai-create-slide-deck-variants/ und startet den Preflight.
#
# Wer das Skill schon manuell platziert hat: direkt preflight.sh aufrufen,
# dann ist dieses Skript ueberfluessig.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_SKILLS="$HOME/.claude/skills"
TARGET="$CLAUDE_SKILLS/ai-create-slide-deck-variants"

step() { printf "\n\033[1;34m==>\033[0m %s\n" "$1"; }
ok()   { printf "    \033[32mOK\033[0m %s\n" "$1"; }
warn() { printf "    \033[33mWARN\033[0m %s\n" "$1"; }

step "ai-create-slide-deck-variants One-Shot-Installer (macOS/Linux)"
echo "    Quelle: $SKILL_DIR"
echo "    Ziel:   $TARGET"

mkdir -p "$CLAUDE_SKILLS"
if [ -e "$TARGET" ]; then
  TS=$(date +"%Y-%m-%d--%H.%M.%S")
  BACKUP="${TARGET}.${TS}.claude-backup"
  warn "Ziel existiert -- Backup nach $BACKUP"
  mv "$TARGET" "$BACKUP"
fi
cp -R "$SKILL_DIR" "$TARGET"
ok "Skill nach $TARGET kopiert"

# Im Ziel ggf. alte Marker entfernen, sodass Preflight sauber laeuft
rm -f "$TARGET/SKILL_INSTALLED.md" "$TARGET/SKILL_INSTALL_FAILED.md"

step "Starte Preflight im Ziel"
bash "$TARGET/scripts/preflight.sh"
PF_EXIT=$?

echo
if [ $PF_EXIT -eq 0 ]; then
  ok "Fertig. Skill 'ai-create-slide-deck-variants' ist in Claude Code einsatzbereit."
  echo "    Test: Claude Code starten und 'erzeuge ein bild von einem lagerfeuer' eingeben."
else
  warn "Preflight ist nicht erfolgreich durchgelaufen."
  echo "    Details in: $TARGET/SKILL_INSTALL_FAILED.md"
fi
exit $PF_EXIT
