<#
.SYNOPSIS
    Runs one Thuisbios web server (TV page or phone app) and restarts it if it stops.

.DESCRIPTION
    This is what the scheduled tasks created by Install-ThuisbiosAutostart.ps1 run. It runs
    "npm run preview" for the chosen app in the repo root and writes all output to
    %USERPROFILE%\.thuisbios\logs\<App>.log. If the server stops, it is started again after
    10 seconds. A log over 5 MB is moved to <App>.old.log when the script starts.

.PARAMETER App
    Which app to run: 'tv' (the TV page) or 'remote' (the phone app).

.PARAMETER Npm
    Path to npm.cmd. Default 'npm.cmd' (found through PATH).

.EXAMPLE
    .\Start-ThuisbiosServer.ps1 -App tv
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('tv', 'remote')]
    [string]$App,

    [string]$Npm = 'npm.cmd'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

$logDir = Join-Path (Join-Path $env:USERPROFILE '.thuisbios') 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir "$App.log"
$oldLog = Join-Path $logDir "$App.old.log"

if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) {
    Move-Item -Path $log -Destination $oldLog -Force
}

function Add-LogLine([string]$Text) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $log -Value "[$stamp] $Text"
}

# Paths go through environment variables and "--%" so cmd.exe receives the quotes exactly as written
# (paths with spaces work, and stdout and stderr both end up in the log in every PowerShell version).
$env:THUISBIOS_NPM = $Npm
$env:THUISBIOS_APP = $App
$env:THUISBIOS_LOG = $log

while ($true) {
    Add-LogLine "Starting $App server"
    cmd.exe /d /c --% ""%THUISBIOS_NPM%" run preview -w apps/%THUISBIOS_APP% >> "%THUISBIOS_LOG%" 2>&1"
    Add-LogLine "Server stopped with exit code $LASTEXITCODE, restarting in 10 seconds"
    Start-Sleep -Seconds 10
}
