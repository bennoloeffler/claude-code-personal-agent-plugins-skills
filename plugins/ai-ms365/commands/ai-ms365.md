---
description: Microsoft 365 (Outlook, Kalender, Teams, SharePoint, OneDrive) — sende Mails, lege Termine an, suche Dateien usw.
argument-hint: <free text, e.g. "last 5 mails" or "meeting tomorrow 2pm with someone@example.com">
allowed-tools: ["mcp__ms365__*", "Read", "Bash"]
---

The user invoked `/ai-ms365` with this request: `$ARGUMENTS`

Handle it as a Microsoft 365 task using the tools from the `ms365` MCP server. Follow the
guidance in the `ai-ms365` skill (loaded automatically) — in particular:

- Convert any natural-language dates/times to ISO 8601 before calling.
- For destructive operations (send, delete, move), show a preview and ask the user to confirm
  before executing.
- For ambiguous requests, ask one clarifying question before guessing.
- If `$ARGUMENTS` is empty, ask the user what they want to do (mail / calendar / teams /
  files / search) and proceed from there.

Special commands:

- If `$ARGUMENTS` equals `login`, **do not** call `mcp__ms365__login`. Instead invoke the
  `/ai-ms365-login` slash command which prints the proper step-by-step terminal-login guide
  for macOS and Windows. If invoking another slash command isn't possible here, print the
  contents of `commands/ai-ms365-login.md` verbatim (without the YAML frontmatter and the
  meta-instruction paragraph at the top — only the user-facing block).
  After the user confirms "fertig" / "done", call `mcp__ms365__verify-login` to confirm.
- If `$ARGUMENTS` equals `verify` or `status`, call `mcp__ms365__verify-login` and report the
  result.
- If `$ARGUMENTS` equals `logout`, call `mcp__ms365__logout`.
- If `$ARGUMENTS` equals `tools`, list the available `mcp__ms365__*` tools as a compact table
  (name + one-line description) so the user can see what's possible.
