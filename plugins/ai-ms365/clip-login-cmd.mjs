// Copies the OS-appropriate ms-365 login command to the user's clipboard
// and prints a single-line status the slash command parses.
// Used by /ai-ms365-login so the user just has to paste in their terminal.

import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const cmd = isWin
  ? '%USERPROFILE%\\.config\\ms-365-mcp\\login.cmd'
  : 'bash ~/.config/ms-365-mcp/login.sh';

let tool, args;
if (isMac)      { tool = 'pbcopy';   args = []; }
else if (isWin) { tool = 'clip';     args = []; }
else            { tool = 'xclip';    args = ['-selection', 'clipboard']; }

const p = spawn(tool, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });

p.on('error', (err) => {
  console.log(`AUTO_COPY_FAILED: ${err.code || err.message} — ${cmd}`);
  process.exit(0);
});

p.on('exit', (code) => {
  if (code === 0) console.log(`AUTO_COPY_OK: ${cmd}`);
  else            console.log(`AUTO_COPY_EXIT_${code}: ${cmd}`);
});

p.stdin.write(cmd);
p.stdin.end();
