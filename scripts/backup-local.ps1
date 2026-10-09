<#
.SYNOPSIS
  Back up / restore the local development database (scripts\devdb.ps1 cluster).

    .\scripts\backup-local.ps1                 # -> backups\educentr-dev-<timestamp>.dump
    .\scripts\backup-local.ps1 -Restore <file> # restores (asks for confirmation)
#>
param([string]$Restore)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Cred = Join-Path $Root '.devdb\credentials.txt'
if (-not (Test-Path $Cred)) { throw 'Dev cluster not initialised (scripts\devdb.ps1 init).' }
$url = (Select-String -Path $Cred -Pattern '^DATABASE_URL=(.+)$').Matches[0].Groups[1].Value

$svc = Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" -ErrorAction SilentlyContinue | Select-Object -First 1
$bin = if ($env:PG_BIN) { $env:PG_BIN } elseif ($svc -and $svc.PathName -match '"([^"]+\\bin)\\pg_ctl\.exe"') { $Matches[1] } else { throw 'Set $env:PG_BIN' }

$outDir = Join-Path $Root 'backups'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if ($Restore) {
    $answer = Read-Host "This OVERWRITES the dev database. Type YES to continue"
    if ($answer -ne 'YES') { Write-Host 'Aborted.'; return }
    & (Join-Path $bin 'pg_restore.exe') --clean --if-exists --no-owner -d $url $Restore
    Write-Host 'Restore finished.'
} else {
    $file = Join-Path $outDir ("educentr-dev-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    & (Join-Path $bin 'pg_dump.exe') -Fc -f $file $url
    Write-Host "Backup written: $file"
}
