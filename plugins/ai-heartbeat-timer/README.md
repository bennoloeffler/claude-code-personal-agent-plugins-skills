# ai-heartbeat-timer

Self-ticking cron replacement for Claude Code. Define recurring prompts in `timer.md`; a bundled MCP server reads the file every minute and pushes due entries as `<channel source="heartbeat">` events into the running Claude Code session.

**No launchd. No cron. No HTTP. No tokens.** Pure Bun setInterval loop in a long-lived MCP subprocess. Lives with Claude Code, dies with it.

## Install

```
/plugin marketplace add <owner>/<marketplace-repo>
/plugin install ai-heartbeat-timer@<marketplace>
```

> Replace `<owner>/<marketplace-repo>` with the GitHub repo that hosts this plugin's `.claude-plugin/marketplace.json`, and `<marketplace>` with the marketplace name registered there. (Throughout this README, `ai-plugins` is used as a placeholder — substitute your real marketplace name.)

## ⚠ Activate the channel (required — silent failure if skipped)

Installing the plugin alone is **not enough**. Claude Code gates MCP `claude/channel` notifications behind a CLI flag. Without it, the heartbeat MCP server ticks fine, fires on schedule, writes its log — and Claude Code silently drops every notification. You see nothing.

### TL;DR — launch command

```bash
claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins
```

Add your other flags (`--dangerously-skip-permissions`, etc.) as usual.

### Why this flag exists

The `claude/channel` MCP capability is experimental and lets servers push prompts into a running session without user interaction. To prevent third-party plugins from doing that without consent, Claude Code gates it — any failed gate silently skips the channel:

| # | Gate | What you need |
|---|------|---------------|
| 1 | Server declares `experimental: { "claude/channel": {} }` | ✅ already done by heartbeat |
| 2 | Channels feature available in your build | newer Claude Code versions |
| 3 | claude.ai OAuth token present | run `/login` (API-key-only sessions are rejected) |
| 4 | Team/Enterprise: `channelsEnabled: true` in managed settings | admin-set |
| 5 | Server is in this session's `--channels` list | pass it on launch |
| 6 | Installed marketplace matches the one you named | use the marketplace name from `/plugin` Marketplaces tab |
| 7 | Plugin is on approved allowlist **OR** loaded via `--dangerously-load-development-channels` | bypass for local/private marketplaces |

For unlisted or private marketplaces, gate 7 needs the dev flag.

### Two ways to launch

**A) Local / private marketplace (most users today):**
```bash
claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins
```

**B) Org-approved (Team/Enterprise plan, admin-configured):**
```bash
claude --channels plugin:ai-heartbeat-timer@ai-plugins
```
Requires an admin to set in managed settings:
```json
{
  "channelsEnabled": true,
  "allowedChannelPlugins": [
    { "plugin": "ai-heartbeat-timer", "marketplace": "ai-plugins" }
  ]
}
```

### Make it permanent (shell alias)

Add to `~/.zshrc` or `~/.bashrc`:
```bash
alias claude-heartbeat='claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins --dangerously-skip-permissions'
```
Then `cd <project>` and `claude-heartbeat`.

### Verify it's actually working

After launching with the flag, the session's system reminders include a block starting with `## plugin:ai-heartbeat-timer:heartbeat` and describing how channel events arrive. If you don't see that, the channel is still gated — re-check the gates above.

When a timer fires, you'll get a `<channel source="heartbeat" name="..." time="...">PROMPT</channel>` event in your session, and a `.ai-heartbeat-timer/` folder (containing `heartbeat.log`, `state.json`, `heartbeat.lock`, `status-<id>.txt`) appears in the project root.

## Quickstart

1. Create `timer.md` in your project root (or copy the template):
   ```bash
   cp "$(claude plugin root ai-heartbeat-timer)/templates/timer.md" ./timer.md
   ```

2. Add a timer row:
   ```markdown
   | Zeit  | Tage     | Name          | Prompt |
   |-------|----------|---------------|--------|
   | 09:00 | weekdays | morning-todos | Read my TODOs and name the most important three |
   ```

3. Start Claude Code with the channel flag (see [Activate the channel](#-activate-the-channel-required--silent-failure-if-skipped) above):
   ```bash
   claude --dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins
   ```

4. At 09:00 on a weekday, Claude receives a heartbeat channel event with your prompt.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Timer never fires, no `.ai-heartbeat-timer/heartbeat.log` | Channel flag missing | Re-launch with `--dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins` |
| `.ai-heartbeat-timer/heartbeat.log` shows `FIRED` but no event in session | OAuth missing (gate 3) | `/login` to claude.ai |
| "is not on the approved channels allowlist" error | Wrong marketplace name or missing dev flag | Verify marketplace name in `/plugin` → Marketplaces; use dev flag |
| "server X not in --channels list for this session" | Forgot to name the plugin on launch | Add `plugin:ai-heartbeat-timer@ai-plugins` after the flag |
| Timer fires twice | State file out of sync after rename | `bun "$(claude plugin root ai-heartbeat-timer)/mcp/heartbeat-channel/state.ts" show` to inspect; the `/ai-timer` skill auto-migrates state on rename |
| MCP server not running (`/mcp` shows red) | `bun` not installed or `.mcp.json` not picked up | `curl -fsSL https://bun.sh/install \| bash`, then `/reload-plugins` |

## How it works

The plugin ships an MCP server (`mcp/heartbeat-channel/heartbeat-channel.ts`) that Claude Code spawns automatically (`.mcp.json`). The server:

1. Reads `timer.md` in your project root every minute
2. Matches each entry's `Zeit` + `Tage` against current time
3. If due: pushes `mcp.notification(claude/channel)` with your prompt
4. Tracks state in `.ai-heartbeat-timer/state.json` (`firedToday`, `lastFire`)
5. Logs to `.ai-heartbeat-timer/heartbeat.log` (local time)

The plugin uses two environment variables:
- `HEARTBEAT_PROJECT_ROOT` — set automatically by `.mcp.json` to `${PROJECT_ROOT}`
- Falls back to `PROJECT_ROOT` or `cwd()` if not set

`timer.md` lives at your project root; all runtime files (log, state, lock, per-instance status) live in `.ai-heartbeat-timer/` so they don't pollute the top level. The plugin code itself stays in Claude's plugin cache.

## Use the ai-timer skill to manage timers

The plugin bundles a `/ai-timer` skill that adds/changes/removes timers via natural language (English + German trigger phrases):

```
/ai-timer every weekday at 8am ask me what's coming up today
/ai-timer every 2h ask me about pause
/ai-timer change morning-check to 9:00
/ai-timer delete pause-nudge
```

## Files in your project

| Path | Purpose | Commit? |
|---|---|---|
| `timer.md` | Your timer schedule | ✅ |
| `.ai-heartbeat-timer/heartbeat.log` | Runtime log (append-only) | ❌ (gitignore the whole folder) |
| `.ai-heartbeat-timer/state.json` | `firedToday` + `lastFire` state | ❌ |
| `.ai-heartbeat-timer/heartbeat.lock` | Single-firer lock | ❌ |
| `.ai-heartbeat-timer/status-<id>.txt` | Per-instance live status (one per running session) | ❌ |

Add `.ai-heartbeat-timer/` to your project's `.gitignore`.

## Manual ops

```bash
# Validate timer.md
bun "$(claude plugin root ai-heartbeat-timer)/mcp/heartbeat-channel/validate.ts"

# State operations
bun "$(claude plugin root ai-heartbeat-timer)/mcp/heartbeat-channel/state.ts" show
bun "$(claude plugin root ai-heartbeat-timer)/mcp/heartbeat-channel/state.ts" delete morning-todos
bun "$(claude plugin root ai-heartbeat-timer)/mcp/heartbeat-channel/state.ts" rename old-name new-name
```

## Requirements

- **Bun** (`curl -fsSL https://bun.sh/install | bash`)
- Claude Code

## Docs

- `docs/ARCHITECTURE.md` — internals: tick loop, state, error reporting, single-firer lock

## License

MIT
