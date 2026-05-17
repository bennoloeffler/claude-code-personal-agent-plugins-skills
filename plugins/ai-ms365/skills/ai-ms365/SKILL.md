---
name: ai-ms365
description: Use this skill whenever the user asks for anything involving Microsoft 365 — Outlook mail, Outlook calendar, Teams, SharePoint, OneDrive, Excel-on-OneDrive, or Azure AD users/contacts — OR asks to log in / authenticate the MS365 MCP. Trigger phrases include "send mail", "schreib eine Mail", "Termin", "meeting", "Kalender", "Outlook", "Teams Nachricht", "OneDrive", "SharePoint", "Excel-Datei in OneDrive", "login mcp", "ms365 login", "login ms365", "anmelden ms365", "MS365 anmelden", "verify login", "auth ms365". Provides guidance on which mcp__ms365__* tools to call, what their arguments mean, and how to handle authentication and common pitfalls.
---

# ai-ms365 — Microsoft 365 via MCP

This plugin exposes the [@softeria/ms-365-mcp-server](https://github.com/Softeria/ms-365-mcp-server)
(started in `--org-mode`, so Teams and SharePoint tools are available).

## Tool naming

All tools appear in the MCP namespace `ms365`, i.e. as `mcp__ms365__<tool>`. Use the tool list
returned by the runtime as the source of truth — the names below are the stable ones from the
upstream server. If a tool name listed here does not exist at runtime, prefer a near-named tool
shown in `/mcp` over guessing.

## Authentication — first-time login MUST run in a terminal

The server uses Microsoft Graph with the user's Azure AD app (credentials are loaded by
`run.js` from `~/.claude/.env/ms365.env`; the user supplies their own). On the very first
call in a fresh session, an interactive **device-code login** is required.

> **Important:** the in-cowork `mcp__ms365__login` tool **cannot** complete the login. It
> returns the device code immediately, but the long-running polling that waits for the user to
> finish in the browser gets killed when cowork's MCP sandbox tears down the server (~1 min
> after the tool returns). The user finishes the browser flow but no process is alive to
> receive the token.
>
> **Workaround:** the login must run in a normal terminal (the wrapped `run.js --login` flow).
> The plugin ships a script for that. Once it succeeds, the token lands in a file that
> in-cowork calls read back automatically.

### What to do when `verify-login` fails OR the user asks to log in

If the user expresses a login intent ("login mcp", "ms365 login", "anmelden", "auth", etc.)
**or** `mcp__ms365__verify-login` returns `success: false` ("No valid token found" / "Silent
token acquisition failed"):

1. **Do not** call `mcp__ms365__login` — it returns a device code but the polling that waits
   for the browser flow gets killed when cowork tears down the MCP server (~1 min after the
   tool call returns), so the token never arrives.
2. **Do** invoke the `/ai-ms365-login` slash command — it prints a clean step-by-step
   terminal-based login guide for both macOS and Windows. If you can't invoke another slash
   command from the current context, print the same instructions verbatim from
   `commands/ai-ms365-login.md`. The user-facing path is **always**:
   - macOS / Linux: `bash ~/.config/ms-365-mcp/login.sh`
   - Windows: `%USERPROFILE%\.config\ms-365-mcp\login.cmd`
   These are auto-installed by `run.js` on every cowork start (the plugin itself lives in
   a session-randomized sandbox path that nobody can guess, so we can't point users there).
3. After the user confirms "fertig" / "done" / "completed", call `mcp__ms365__verify-login`
   to confirm the token is now picked up from the file cache. On `success: true`, proceed
   with whatever they originally wanted.

The token persists across cowork sessions. Re-login is only needed if they explicitly call
`mcp__ms365__logout`, the refresh token rotates out, or the Azure secret is rotated.

## Capability cheat-sheet (org-mode is ON)

### Mail (Outlook)
- `list-mail-messages` — list inbox/folder; common args: `top` (count, default 10), `folder`
  (e.g. `inbox`, `sentitems`), `search` (KQL-like).
- `read-mail` — read full body of one message by `messageId`.
- `send-mail` — args: `to` (string or array), `subject`, `body`. HTML body is supported via the
  `bodyType: "html"` field if available.
- `delete-mail`, `move-mail`, `mark-read` — write operations; **always confirm with the user
  before sending or deleting**.

### Calendar
- `list-calendar-events` — args: `startDate`, `endDate` in ISO 8601 (e.g. `2026-05-01T00:00:00Z`).
- `create-calendar-event` — args: `subject`, `start`, `end`, `attendees` (array of emails),
  `location`, `body`. Use `isOnlineMeeting: true` to add a Teams link.
- `update-calendar-event`, `delete-calendar-event` — confirm before destructive ops.

### Teams (org-mode)
- `list-teams` — Teams the user is a member of.
- `list-channels` — args: `teamId`.
- `send-teams-message` — args: `teamId`, `channelId`, `message`.
- `list-team-messages` — recent messages in a channel.

### SharePoint / OneDrive
- `list-drive-items` — list files/folders. Default drive is OneDrive; pass a `driveId` for
  SharePoint document libraries.
- `download-drive-item`, `upload-drive-item` — file content.
- `search-drive` — full-text search over OneDrive/SharePoint.

### Users & directory
- `get-current-user`, `search-users`, `get-user-by-email`.

### Excel (files in OneDrive/SharePoint)
- `list-worksheets`, `read-range`, `update-range`, `create-worksheet`. Args generally take an
  Excel file path or `driveItemId`.

## Patterns

### "Show me my last N mails"
1. Call `list-mail-messages` with `top: N`, `folder: "inbox"`.
2. Render a compact summary: `[date] from — subject (preview…)`.
3. Do **not** dump full bodies unless the user asks.

### "Send a mail to X"
1. Confirm recipient(s), subject, body with the user — show the planned mail before sending.
2. Call `send-mail`.
3. Report the message id from the response.

### "Schedule a meeting"
1. Ask for: subject, start, end, attendees, online y/n.
2. Convert times to ISO 8601 in the user's local zone (server expects ISO 8601 timestamps).
3. Call `create-calendar-event` with `isOnlineMeeting: true` if Teams link wanted.
4. Return the event link.

### "What's on my calendar this week?"
1. Compute Monday 00:00 → Sunday 23:59 in user's local zone, convert to ISO 8601 UTC.
2. Call `list-calendar-events` with that range.
3. Render as `Mon 09:00–10:00 — subject (location)`.

## Pitfalls

- **Date strings:** the server expects ISO 8601 (`2026-05-02T14:00:00Z` or with offset). Don't
  pass `"next Tuesday at 2pm"` — convert first.
- **Pagination:** large folders are paginated. If a result mentions a continuation/`nextLink`,
  pass it back to fetch more.
- **Permissions:** the Azure AD app has whatever Graph permissions the user granted it when
  registering. If a call returns `Authorization_RequestDenied`, the scope is missing — tell
  the user; do not retry blindly.
- **Org-mode:** Teams and SharePoint only work because the server runs with `--org-mode`. If a
  user reports those tools missing, the plugin is misconfigured — `.mcp.json` must include
  `--org-mode` (it does by default in ai-ms365).
- **Token expiry:** if a call fails with `InvalidAuthenticationToken`, first try
  `mcp__ms365__verify-login`. If it can't recover, point the user at `login.sh` / `login.cmd`
  (see Authentication section above) — do **not** call `mcp__ms365__login`, it can't complete
  inside cowork.

## When invoked as `/ai-ms365 <text>`

Treat `<text>` as a free-form Microsoft 365 request and route it to the right tool family above.
For ambiguous requests (e.g. "send something to Alex"), ask one clarifying question before
acting. For destructive operations (send, delete, move), always show a preview and require user
confirmation.
