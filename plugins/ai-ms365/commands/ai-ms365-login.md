---
description: Microsoft 365 Login — prüft Status, kopiert den passenden Terminal-Befehl in die Zwischenablage, zeigt die Anleitung
argument-hint: (keine Argumente)
allowed-tools: ["Bash", "mcp__ms365__verify-login"]
---

Execute these steps in order. Do not narrate the steps — only print the user-facing
output described in step 4.

**Step 1 — Call `mcp__ms365__verify-login`.** Two purposes:
  (a) If the user is already logged in, we short-circuit.
  (b) Calling any MS365 MCP tool boots the server (= runs `run.js`), which is what
      installs the helper files into `~/.config/ms-365-mcp/`. Even on failure, this
      side-effect is exactly what we need before step 2.

If the response is `success: true`, do **not** continue. Print only this short block:

```
✓ Du bist bereits angemeldet — alles gut, kein Login nötig.
```

…and stop. Do not call any further tools.

If `success: false` (or any other non-success), continue to step 2.

**Step 2 — Copy the OS-appropriate login command to the user's clipboard.**

Run this Bash command exactly:

```bash
node ~/.config/ms-365-mcp/clip-login-cmd.mjs 2>&1
```

Output is a single line starting with `AUTO_COPY_OK:`, `AUTO_COPY_FAILED:`, or `AUTO_COPY_EXIT_<n>:`.

**Step 3 — Pick the right "kopiert" line based on step 2's output:**

- starts with `AUTO_COPY_OK:` → use: `> ✓ Der passende Befehl ist bereits in deiner **Zwischenablage** — im Terminal nur ⌘+V / Strg+V drücken.`
- otherwise → use: `> ⚠ Auto-Copy hat nicht geklappt — bitte den Befehl unten manuell kopieren.`

**Step 4 — Print the help block exactly as written below**, with the chosen "kopiert" line replacing `<chosen-kopiert-line>`. Preserve all formatting. Do not add any prefix, suffix, narration, or summary. Do not call any further tools. After printing, wait for the user to say "fertig" / "done" — only then call `mcp__ms365__verify-login` again to confirm.

---

## Microsoft 365 — Einmaliger Login

<chosen-kopiert-line>

Cowork kann den MS365-Login nicht selbst zu Ende führen — das Polling (1–15 Min) wird vom MCP-Sandbox abgeschnitten. Daher einmalig aus einem normalen Terminal. Das Skript macht den Rest fast komplett für dich:

- Öffnet automatisch den Browser
- Kopiert den Code in die Zwischenablage
- Du brauchst nur noch im Browser einfügen und einloggen

### macOS

1. **Spotlight öffnen:** `⌘` + `Leertaste`
2. **Tippe:** `Terminal` → `Enter`
3. **Im Terminal `⌘+V` drücken** (Befehl ist schon in der Zwischenablage), dann `Enter`. Falls nicht: diesen Befehl manuell tippen:

```bash
bash ~/.config/ms-365-mcp/login.sh
```

4. Im Browser, der sich öffnet: Code mit `⌘+V` einfügen → `Weiter` → mit Microsoft-Account anmelden
5. Wenn das Terminal `Login erfolgreich.` anzeigt → zurück hier in cowork, schreib **fertig**

### Windows

1. **Startmenü öffnen:** `Windows`-Taste
2. **Tippe:** `cmd` → `Enter`
3. **Im cmd-Fenster `Strg+V` drücken** (Befehl ist schon in der Zwischenablage), dann `Enter`. Falls nicht: diesen Befehl manuell tippen:

```cmd
%USERPROFILE%\.config\ms-365-mcp\login.cmd
```

*Alternative:* im Datei-Explorer zu `%USERPROFILE%\.config\ms-365-mcp\` navigieren und `login.cmd` doppelklicken.

4. Im Browser, der sich öffnet: Code mit `Strg+V` einfügen → `Weiter` → mit Microsoft-Account anmelden
5. Wenn das Terminal `Login erfolgreich.` anzeigt → zurück hier in cowork, schreib **fertig**

---

**Browser/Zwischenablage haben beim Login-Skript nicht automatisch geklappt?** Kein Problem — die URL und der Code werden im Terminal trotzdem in einem grünen Block groß angezeigt. URL einfach mit `⌘+Klick` (Mac) bzw. `Strg+Klick` (Windows-Terminal) öffnen, Code abtippen.
