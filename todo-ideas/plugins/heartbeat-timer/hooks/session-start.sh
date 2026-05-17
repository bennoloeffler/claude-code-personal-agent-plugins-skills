#!/usr/bin/env bash
# SessionStart hook for heartbeat-timer.
# - If no timer.md in project: silent exit (project doesn't use heartbeat).
# - Otherwise: build a status message and emit it as JSON with BOTH
#     "systemMessage"                       -> shown in the user's terminal
#     "hookSpecificOutput.additionalContext" -> injected into Claude's context
#   Falls back to plain stdout when no JSON encoder is available.
set -u

PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
TIMER="$PROJ/timer.md"
LOG="$PROJ/.heartbeat-timer/heartbeat.log"

[ -f "$TIMER" ] || exit 0

# --- portable timestamp -> epoch (BSD/GNU/python/perl) ---
to_epoch() {
  local ts="$1" out=""
  out=$(date -d "$ts" "+%s" 2>/dev/null) && [ -n "$out" ] && { printf '%s\n' "$out"; return 0; }
  out=$(date -j -f "%Y-%m-%d %H:%M:%S" "$ts" "+%s" 2>/dev/null) && [ -n "$out" ] && { printf '%s\n' "$out"; return 0; }
  out=$(python3 -c 'import sys,time; print(int(time.mktime(time.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S"))))' "$ts" 2>/dev/null) \
    && [ -n "$out" ] && { printf '%s\n' "$out"; return 0; }
  out=$(perl -MTime::Piece -e 'print Time::Piece->strptime($ARGV[0], "%Y-%m-%d %H:%M:%S")->epoch, "\n"' "$ts" 2>/dev/null) \
    && [ -n "$out" ] && { printf '%s\n' "$out"; return 0; }
  return 1
}

# --- build the user-facing status message ---
build_message() {
  echo "=== heartbeat-timer: timer.md ==="
  cat "$TIMER"
  echo
  echo "=== heartbeat-timer: channel status ==="

  # MCP server writes its first log line on startup; poll briefly so we don't
  # falsely report INACTIVE during the race between hook and server startup.
  local i
  for i in 1 2 3 4 5 6 7 8; do
    [ -f "$LOG" ] && break
    sleep 1
  done

  if [ ! -f "$LOG" ]; then
    cat <<'INACTIVE'
Status: INACTIVE -- .heartbeat-timer/heartbeat.log fehlt im Projektroot.

Der Heartbeat-MCP-Channel ist in dieser Session nicht aktiv. Timer-Eintraege
werden NICHT feuern. Beende diese Session und starte Claude mit:

  claude --dangerously-load-development-channels plugin:heartbeat-timer@MARKETPLACE_NAME --dangerously-skip-permissions

Alias-Vorschlag fuer ~/.zshrc:
  alias claude-heartbeat='claude --dangerously-load-development-channels plugin:heartbeat-timer@MARKETPLACE_NAME --dangerously-skip-permissions'

Zusaetzlich: bei claude.ai eingeloggt sein (Channels brauchen OAuth-Token).
INACTIVE
    return 0
  fi

  local last_line last_ts last_epoch now_epoch age
  last_line=$(tail -n 1 "$LOG" 2>/dev/null | tr -d '\r')
  last_ts=$(printf '%s\n' "$last_line" | awk '{print $1" "$2}')
  last_epoch=$(to_epoch "$last_ts" 2>/dev/null || true)
  now_epoch=$(date "+%s")

  if [ -z "$last_epoch" ]; then
    echo "Status: UNKNOWN -- .heartbeat-timer/heartbeat.log existiert, aber letzte Zeile nicht parsbar:"
    echo "  $last_line"
    return 0
  fi

  age=$((now_epoch - last_epoch))

  if [ "$age" -le 180 ]; then
    echo "Status: ACTIVE (letzter Log-Eintrag vor ${age}s)"
    echo "  $last_line"
  else
    cat <<STALE
Status: STALE -- letzter Log-Eintrag ist ${age}s alt (>3min).

Der Heartbeat-MCP-Server scheint nicht (mehr) zu ticken. Moegliche Ursachen:
  - Channel-Flag fehlt beim Claude-Start
  - Vorherige Session ist abgestuerzt, Lock haengt
  - Server in anderem Projekt-Root aktiv

Restart:
  claude --dangerously-load-development-channels plugin:heartbeat-timer@MARKETPLACE_NAME --dangerously-skip-permissions

Letzter Eintrag:
  $last_line
STALE
  fi
}

MSG=$(build_message)

# --- emit JSON: systemMessage shows in the terminal, additionalContext goes to Claude.
#     Fall back gracefully when no JSON encoder is available. ---
if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$MSG" '{
    systemMessage: $msg,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: $msg }
  }'
elif command -v python3 >/dev/null 2>&1; then
  MSG="$MSG" python3 -c '
import json, os
m = os.environ["MSG"]
print(json.dumps({
  "systemMessage": m,
  "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": m}
}))
'
elif command -v perl >/dev/null 2>&1; then
  MSG="$MSG" perl -e '
use strict; use warnings;
my $m = $ENV{MSG};
$m =~ s/\\/\\\\/g; $m =~ s/"/\\"/g; $m =~ s/\n/\\n/g; $m =~ s/\r/\\r/g; $m =~ s/\t/\\t/g;
print qq({"systemMessage":"$m","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"$m"}}\n);
'
else
  # No JSON encoder — plain stdout still ends up in Claude's context as
  # additionalContext, just not rendered in the terminal.
  printf '%s\n' "$MSG"
fi
