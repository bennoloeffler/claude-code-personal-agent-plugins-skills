# ai-create-slide-deck-variants -- One-Shot-Installer fuer Windows
# Kopiert das Skill nach %USERPROFILE%\.claude\skills\ai-create-slide-deck-variants\ und startet den Preflight.
#
# Wer das Skill schon manuell platziert hat: direkt preflight.ps1 aufrufen.

$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillDir    = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$ClaudeRoot  = Join-Path $env:USERPROFILE '.claude\skills'
$Target      = Join-Path $ClaudeRoot 'ai-create-slide-deck-variants'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    WARN $m" -ForegroundColor Yellow }

Step "ai-create-slide-deck-variants One-Shot-Installer (Windows)"
Write-Host "    Quelle: $SkillDir"
Write-Host "    Ziel:   $Target"

New-Item -ItemType Directory -Path $ClaudeRoot -Force | Out-Null
if (Test-Path $Target) {
    $ts = Get-Date -Format 'yyyy-MM-dd--HH.mm.ss'
    $backup = "$Target.$ts.claude-backup"
    Warn "Ziel existiert -- Backup nach $backup"
    Move-Item $Target $backup
}
Copy-Item -Recurse -Path $SkillDir -Destination $Target
Ok "Skill nach $Target kopiert"

# Alte Marker im Ziel entfernen, sodass Preflight sauber laeuft
Remove-Item -ErrorAction SilentlyContinue (Join-Path $Target 'SKILL_INSTALLED.md')
Remove-Item -ErrorAction SilentlyContinue (Join-Path $Target 'SKILL_INSTALL_FAILED.md')

Step "Starte Preflight im Ziel"
& powershell -ExecutionPolicy Bypass -File (Join-Path $Target 'scripts\preflight.ps1')
$pfExit = $LASTEXITCODE

Write-Host ""
if ($pfExit -eq 0) {
    Ok "Fertig. Skill 'ai-create-slide-deck-variants' ist in Claude Code einsatzbereit."
    Write-Host "    Test: Claude Code starten und 'erzeuge ein bild von einem lagerfeuer' eingeben."
} else {
    Warn "Preflight ist nicht erfolgreich durchgelaufen."
    Write-Host "    Details in: $Target\SKILL_INSTALL_FAILED.md"
}
exit $pfExit
