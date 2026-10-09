<#
.SYNOPSIS
  Local development PostgreSQL cluster for EduCentr (Windows, no Docker required).

.DESCRIPTION
  Creates and manages a project-local PostgreSQL cluster that runs next to (and never
  touches) any PostgreSQL service already installed on the machine.

    .\scripts\devdb.ps1 init     # one time: initdb, create role + database, write backend\.env
    .\scripts\devdb.ps1 start    # start the cluster (needed after every reboot)
    .\scripts\devdb.ps1 stop     # stop the cluster
    .\scripts\devdb.ps1 status   # show whether it is running
    .\scripts\devdb.ps1 psql     # open psql as the application role

  Data lives in .devdb\ (git-ignored). Delete that folder (after `stop`) to start over.

  PostgreSQL binaries are located via $env:PG_BIN, then pg_ctl on PATH, then the
  binary path of an installed "postgresql-x64-*" Windows service.
#>
param(
    [ValidateSet('init', 'start', 'stop', 'status', 'psql')]
    [string]$Command = 'status'
)

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $PSScriptRoot
$DevDir   = Join-Path $Root '.devdb'
$DataDir  = Join-Path $DevDir 'data'
$LogFile  = Join-Path $DevDir 'postgres.log'
$CredFile = Join-Path $DevDir 'credentials.txt'
$EnvFile  = Join-Path $Root 'backend\.env'
$Port     = if ($env:DEVDB_PORT) { [int]$env:DEVDB_PORT } else { 5433 }
$AppRole  = 'educentr'
$AppDb    = 'educentr'

function Find-PgBin {
    if ($env:PG_BIN -and (Test-Path (Join-Path $env:PG_BIN 'pg_ctl.exe'))) { return $env:PG_BIN }
    $cmd = Get-Command pg_ctl -ErrorAction SilentlyContinue
    if ($cmd) { return Split-Path -Parent $cmd.Source }
    $svc = Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($svc -and $svc.PathName -match '"([^"]+\\bin)\\pg_ctl\.exe"') { return $Matches[1] }
    throw 'PostgreSQL binaries not found. Set $env:PG_BIN to the folder that contains pg_ctl.exe.'
}

function New-Secret {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Test-Running {
    & (Join-Path $PgBin 'pg_ctl.exe') status -D $DataDir *> $null
    return ($LASTEXITCODE -eq 0)
}

function Start-Cluster {
    if (Test-Running) { Write-Host "Already running on port $Port."; return }
    # pg_ctl's child keeps inherited stdout handles open for the server's lifetime, so it
    # must not be piped/captured: start it as a detached process and wait for pg_ctl only.
    $args = @('start', '-D', "`"$DataDir`"", '-l', "`"$LogFile`"", '-w', '-t', '60')
    $p = Start-Process -FilePath (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList $args `
        -WindowStyle Hidden -PassThru
    $p.WaitForExit()
    if (-not (Test-Running)) { throw "pg_ctl start failed - see $LogFile" }
    Write-Host "Started on 127.0.0.1:$Port."
}

$PgBin = Find-PgBin

switch ($Command) {
    'init' {
        if (Test-Path (Join-Path $DataDir 'PG_VERSION')) {
            throw "Cluster already initialised in $DataDir. Use 'start', or stop it and delete .devdb to re-create."
        }
        New-Item -ItemType Directory -Force -Path $DevDir | Out-Null
        $superPw = New-Secret
        $appPw   = New-Secret
        $pwFile  = Join-Path $DevDir 'initdb-pw.tmp'
        Set-Content -Path $pwFile -Value $superPw -NoNewline -Encoding ascii
        try {
            & (Join-Path $PgBin 'initdb.exe') -D $DataDir -U postgres -A scram-sha-256 "--pwfile=$pwFile" `
                -E UTF8 --locale-provider=builtin --builtin-locale=C.UTF-8 --locale=C | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
        } finally {
            Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
        }
        # Bind to localhost only, on the dedicated port.
        Add-Content -Path (Join-Path $DataDir 'postgresql.conf') -Encoding ascii -Value @"

# --- EduCentr dev cluster ---
port = $Port
listen_addresses = 'localhost'
timezone = 'UTC'
log_timezone = 'UTC'
"@
        Start-Cluster
        $env:PGPASSWORD = $superPw
        $psql = Join-Path $PgBin 'psql.exe'
        & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 `
            -c "CREATE ROLE $AppRole LOGIN PASSWORD '$appPw' CREATEDB;" `
            -c "CREATE DATABASE $AppDb OWNER $AppRole;" | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Creating role/database failed' }
        Remove-Item Env:\PGPASSWORD
        $dbUrl = "postgres://${AppRole}:${appPw}@127.0.0.1:${Port}/${AppDb}"
        Set-Content -Path $CredFile -Encoding ascii -Value @"
# EduCentr local dev cluster - DO NOT COMMIT (folder is git-ignored)
superuser: postgres / $superPw
app role:  $AppRole / $appPw
DATABASE_URL=$dbUrl
"@
        Write-Host ''
        Write-Host "Dev cluster ready on 127.0.0.1:$Port. Credentials saved to .devdb\credentials.txt"
        Write-Host "DATABASE_URL=$dbUrl"
        if (Test-Path $EnvFile) {
            Write-Host "backend\.env already exists - update its DATABASE_URL manually if needed."
        }
    }
    'start'  { Start-Cluster }
    'stop'   {
        if (-not (Test-Running)) { Write-Host 'Not running.'; return }
        & (Join-Path $PgBin 'pg_ctl.exe') stop -D $DataDir -m fast -w | Out-Host
    }
    'status' {
        if (Test-Running) { Write-Host "Running on 127.0.0.1:$Port (data: $DataDir)" }
        else { Write-Host 'Not running.' }
    }
    'psql'   {
        $url = (Select-String -Path $CredFile -Pattern '^DATABASE_URL=(.+)$').Matches[0].Groups[1].Value
        & (Join-Path $PgBin 'psql.exe') $url
    }
}
