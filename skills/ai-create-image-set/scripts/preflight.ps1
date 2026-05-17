# ai-create-image-set preflight bootstrap (Windows)
# Verantwortlich nur fuer: Gate-Check + Node bereitstellen.
# Der eigentliche Check + Install passiert in scripts\preflight-core.mjs.

$ErrorActionPreference = 'Continue'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillDir   = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$Installed  = Join-Path $SkillDir 'SKILL_INSTALLED.md'
$Failed     = Join-Path $SkillDir 'SKILL_INSTALL_FAILED.md'
$SkillName  = 'ai-create-image-set'

function Say($m)  { Write-Host $m }
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    WARN $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "    FAIL $m" -ForegroundColor Red }

function Write-FailedMarker($problem, $nextSteps) {
    $body = @"
# $SkillName`: SKILL_INSTALL_FAILED

**Geschrieben:** $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
**Plattform:** Windows
**Skill-Ordner:** $SkillDir
**Phase:** Bootstrap (Node.js)

## Status: FAILED

$problem

## Naechste Schritte

$nextSteps

---
Nach Behebung: SKILL_INSTALL_FAILED.md loeschen und Preflight erneut starten:
``powershell -ExecutionPolicy Bypass -File "$ScriptDir\preflight.ps1"``
"@
    Set-Content -Path $Failed -Value $body -Encoding utf8
}

# --- Gate ---
if (Test-Path $Installed) {
    Say "Skill ist bereits installiert: $Installed"
    Say "(Loeschen, um Preflight erneut zu starten.)"
    exit 0
}
if (Test-Path $Failed) {
    Say "Frueherer Preflight ist fehlgeschlagen. Inhalt von SKILL_INSTALL_FAILED.md:"
    Say "----------"
    Get-Content $Failed | ForEach-Object { Say $_ }
    Say "----------"
    Say ""
    Say "Bitte Ursache beheben und SKILL_INSTALL_FAILED.md loeschen, dann erneut:"
    Say "  powershell -ExecutionPolicy Bypass -File `"$ScriptDir\preflight.ps1`""
    exit 1
}

Step "$SkillName preflight bootstrap (Windows)"
Say "Skill: $SkillDir"

# --- Bootstrap: Node ---
Step "Bootstrap: Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $ver = (node --version).Trim()
    $major = 0
    if ($ver -match '^v(\d+)') { $major = [int]$Matches[1] }
    if ($major -ge 18) {
        Ok "Node $ver (>= v18) gefunden"
    } else {
        Fail "Node $ver ist zu alt -- mindestens v18 noetig"
        Write-FailedMarker "Node.js Version $ver ist zu alt (mindestens v18 erforderlich)." `
            "Aktualisiere Node via winget (``winget upgrade OpenJS.NodeJS.LTS``) oder von https://nodejs.org/."
        exit 1
    }
} else {
    Warn "Node nicht gefunden -- versuche Installation..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Say "    winget gefunden -- ``winget install OpenJS.NodeJS.LTS`` (dauert 1-3 Minuten)..."
        try {
            winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
            if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
                throw "node nach winget-Install nicht im PATH"
            }
            Ok "Node installiert: $((node --version).Trim())"
        } catch {
            Fail "winget install fehlgeschlagen: $_"
            Write-FailedMarker "``winget install OpenJS.NodeJS.LTS`` ist mit folgendem Fehler abgebrochen: $_" `
                "Bitte Node manuell installieren von https://nodejs.org/de/download. Danach SKILL_INSTALL_FAILED.md loeschen und Preflight erneut starten."
            exit 1
        }
    } else {
        Fail "Weder Node noch winget vorhanden"
        Write-FailedMarker "Auf diesem System ist weder Node.js noch winget installiert." `
            "Bitte installiere Node direkt von https://nodejs.org/de/download. Danach erneut."
        exit 1
    }
}

# --- Detail-Preflight ---
Step "Detail-Preflight (OPENAI_API_KEY)"
& node (Join-Path $SkillDir 'scripts\preflight-core.mjs')
exit $LASTEXITCODE
