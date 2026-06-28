<#
.SYNOPSIS
Quick runtime environment audit for Endfield-MCP (Windows / PowerShell 7).

.DESCRIPTION
Verifies the host has the toolchain the repo expects:
  - Bun (>=1.2)
  - TypeScript project installs cleanly
  - typecheck + tests pass

Run this at session start or when command behavior looks suspicious.

.PARAMETER Full
Run the full validation set (typecheck + tests + build) instead of just
the audit.

.EXAMPLE
PS> .\scripts\check-runtime.ps1
PS> .\scripts\check-runtime.ps1 -Full
#>

[CmdletBinding()]
param(
  [switch]$Full
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$tsDir = Join-Path $repoRoot "ts"

function Section($name) {
  Write-Host ""
  Write-Host "=== $name ===" -ForegroundColor Cyan
}

$exitCode = 0

# --- Bun -----------------------------------------------------------------
Section "Bun runtime"
try {
  $bunVersion = (& bun --version) 2>$null
  if (-not $bunVersion) { throw "no output" }
  Write-Host "Bun $bunVersion"
  $major, $minor = $bunVersion.Split(".")[0..1] | ForEach-Object { [int]$_ }
  if (($major -lt 1) -or ($major -eq 1 -and $minor -lt 2)) {
    Write-Warning "Bun >=1.2 recommended; found $bunVersion"
  }
} catch {
  Write-Error "Bun not found on PATH. Install from https://bun.sh"
  $exitCode = 1
  if (-not $Full) { exit $exitCode }
}

if (-not $Full) {
  Section "Audit only"
  Write-Host "Pass -Full to run typecheck + tests + build."
  exit $exitCode
}

# --- install -------------------------------------------------------------
Section "bun install"
Push-Location $tsDir
try {
  & bun install
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
} finally {
  Pop-Location
}

# --- typecheck -----------------------------------------------------------
Section "Typecheck (tsc --noEmit)"
Push-Location $tsDir
try {
  & bun run typecheck
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
} finally {
  Pop-Location
}

# --- test ----------------------------------------------------------------
Section "Tests (bun test)"
Push-Location $tsDir
try {
  & bun test
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
} finally {
  Pop-Location
}

# --- build ---------------------------------------------------------------
Section "Build smoke (tsc emit)"
Push-Location $tsDir
try {
  & bun run build
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "All checks passed." -ForegroundColor Green
} else {
  Write-Host "Some checks failed (exit $exitCode)." -ForegroundColor Red
}
exit $exitCode
