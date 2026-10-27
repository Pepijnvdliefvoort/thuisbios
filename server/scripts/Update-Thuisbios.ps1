<#
.SYNOPSIS
    Moves the Thuisbios project folder to the newest release and restarts the TV page and phone app.

.DESCRIPTION
    This is what the scheduled task \Thuisbios\Update runs (installed by Install-ThuisbiosAutostart.ps1).
    It checks GitHub for the newest release tag (vX.Y.Z). When the project folder is not on that
    release yet, it:
      - stops the TV page and phone app,
      - checks out the release,
      - runs "npm ci" and builds the TV page and phone app, and
      - starts the two tasks again.
    When anything fails it goes back to the previous version, builds that again, starts the
    tasks and exits with code 1. When GitHub cannot be reached it does nothing and tries again next time.
    It does not update when there are local changes to tracked files in the project folder.
    Every step is written to %USERPROFILE%\.thuisbios\logs\update.log (moved to update.old.log
    when it is over 5 MB). Requires Git for Windows and an elevated (administrator) PowerShell.
    Windows only.

.PARAMETER Git
    Path to git.exe. Default 'git.exe' (found through PATH).

.PARAMETER Npm
    Path to npm.cmd. Default 'npm.cmd' (found through PATH).

.PARAMETER Force
    Build and restart even when the project folder is already on the newest release.

.EXAMPLE
    .\Update-Thuisbios.ps1

.EXAMPLE
    .\Update-Thuisbios.ps1 -Force
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Git = 'git.exe',

    [string]$Npm = 'npm.cmd',

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    if ([System.Environment]::OSVersion.Platform -ne 'Win32NT') { return $false }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ([System.Environment]::OSVersion.Platform -ne 'Win32NT') {
    Write-Error 'This script only works on Windows.' -ErrorAction Continue
    exit 1
}
if (-not $WhatIfPreference -and -not (Test-IsAdministrator)) {
    Write-Error 'Administrator rights are required. Start PowerShell with "Run as administrator" and run the script again.' -ErrorAction Continue
    exit 1
}

. (Join-Path $PSScriptRoot 'ThuisbiosUpdate.Helpers.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskPath = '\Thuisbios\'
$servers = @(
    @{ Task = 'TV page'; Port = 4173 },
    @{ Task = 'Phone app'; Port = 4174 }
)

$logDir = Join-Path (Join-Path $env:USERPROFILE '.thuisbios') 'logs'
New-Item -ItemType Directory -Path $logDir -Force -WhatIf:$false | Out-Null
$log = Join-Path $logDir 'update.log'
$oldLog = Join-Path $logDir 'update.old.log'

if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) {
    Move-Item -Path $log -Destination $oldLog -Force -WhatIf:$false
}

function Add-LogLine([string]$Text) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $log -Value "[$stamp] $Text" -WhatIf:$false
    Write-Host "[$stamp] $Text"
}

# Runs a program, writes everything it prints to the log and returns its exit code.
# Errors are turned off around the call: Windows PowerShell 5.1 treats text on stderr as an error.
function Invoke-Logged([string]$Program, [string[]]$Arguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Program @Arguments 2>&1 | ForEach-Object { Add-LogLine ("$_".TrimEnd()) }
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

# Runs git and returns what it prints (lines of text); stderr is ignored. $LASTEXITCODE tells if it worked.
function Get-GitOutput([string[]]$Arguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return @(& $Git -C $repoRoot @Arguments 2>$null | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

function Stop-Servers {
    foreach ($server in $servers) {
        $task = Get-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -ErrorAction SilentlyContinue
        if ($task) { Stop-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -ErrorAction SilentlyContinue }
    }
    foreach ($server in $servers) {
        $listeners = Get-NetTCPConnection -LocalPort $server.Port -State Listen -ErrorAction SilentlyContinue
        foreach ($listener in $listeners) {
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

function Start-Servers {
    foreach ($server in $servers) {
        try {
            Start-ScheduledTask -TaskPath $taskPath -TaskName $server.Task
        }
        catch {
            Add-LogLine "Could not start the $($server.Task): $($_.Exception.Message)"
        }
    }
}

# Installs packages and builds both apps. Returns $true when everything worked.
function Build-Apps {
    $steps = @(
        @{ Text = 'Installing packages'; Args = @('ci') },
        @{ Text = 'Building the TV page'; Args = @('run', 'build', '-w', 'apps/tv') },
        @{ Text = 'Building the phone app'; Args = @('run', 'build', '-w', 'apps/remote') }
    )
    Push-Location $repoRoot
    try {
        foreach ($step in $steps) {
            Add-LogLine "$($step.Text)..."
            $exitCode = Invoke-Logged $Npm $step.Args
            if ($exitCode -ne 0) {
                Add-LogLine "Step failed: $($step.Text) (npm exit code $exitCode)."
                return $false
            }
        }
        return $true
    }
    finally {
        Pop-Location
    }
}

function Restore-PreviousVersion {
    Add-LogLine "Going back to the previous version ($previousLabel)."
    $exitCode = Invoke-Logged $Git (@('-C', $repoRoot, '-c', 'advice.detachedHead=false', 'checkout', '--force', $previousRef))
    if ($exitCode -ne 0) {
        Add-LogLine "Could not go back to $previousLabel (git exit code $exitCode). Fix the project folder by hand."
        return
    }
    if (-not (Build-Apps)) {
        Add-LogLine 'Building the previous version failed too. The pages may not work until this is fixed.'
    }
    Start-Servers
    Add-LogLine "Went back to the previous version ($previousLabel). Update to $latestTag failed."
}

try {
    Add-LogLine 'Checking for a new release...'

    $null = Get-GitOutput @('rev-parse', '--git-dir')
    if ($LASTEXITCODE -ne 0) {
        Add-LogLine "$repoRoot is not a git folder (or git was not found at '$Git'). Not updating."
        exit 1
    }

    if ($PSCmdlet.ShouldProcess('origin', 'Fetch releases from GitHub')) {
        $exitCode = Invoke-Logged $Git @('-C', $repoRoot, 'fetch', '--force', '--tags', 'origin')
        if ($exitCode -ne 0) {
            Add-LogLine 'Could not reach GitHub, trying again next time.'
            exit 0
        }
    }

    $latestTag = Get-LatestReleaseTag -Tags (Get-GitOutput @('tag', '--list', 'v*'))
    if (-not $latestTag) {
        Add-LogLine 'There are no releases yet. Nothing to do.'
        exit 0
    }

    $currentTag = Get-LatestReleaseTag -Tags (Get-GitOutput @('tag', '--points-at', 'HEAD'))
    if (-not (Test-UpdateNeeded -Current $currentTag -Latest $latestTag -Force:$Force)) {
        if ($currentTag -eq $latestTag) {
            Add-LogLine "Already on $latestTag. Nothing to do."
        }
        else {
            Add-LogLine "This folder is on $currentTag, which is newer than the newest release on GitHub ($latestTag). Nothing to do."
        }
        exit 0
    }

    $previousCommit = (Get-GitOutput @('rev-parse', 'HEAD') | Select-Object -First 1)
    $branch = (Get-GitOutput @('symbolic-ref', '--quiet', '--short', 'HEAD') | Select-Object -First 1)
    $previousRef = if ($branch) { $branch } else { $previousCommit }
    $previousLabel = if ($currentTag) { $currentTag } elseif ($branch) { $branch } else { "$previousCommit".Substring(0, [Math]::Min(8, "$previousCommit".Length)) }

    # A release from before automatic updates does not contain this script. Checking it out would
    # delete the script and break the scheduled task, so stay where we are.
    $null = Get-GitOutput @('cat-file', '-e', "${latestTag}:server/scripts/Update-Thuisbios.ps1")
    if ($LASTEXITCODE -ne 0) {
        Add-LogLine "The newest release ($latestTag) does not include automatic updates yet, so this folder stays on $previousLabel. The next release will be installed automatically."
        exit 0
    }

    $changes = Get-GitOutput @('status', '--porcelain', '--untracked-files=no')
    if ($changes.Count -gt 0) {
        Add-LogLine "There are local changes in $repoRoot; not updating. Undo them with: git checkout -- ."
        exit 1
    }

    if (-not $PSCmdlet.ShouldProcess($repoRoot, "Update from $previousLabel to $latestTag")) {
        Add-LogLine "WhatIf: would update from $previousLabel to $latestTag."
        exit 0
    }

    Add-LogLine "Updating from $previousLabel to $latestTag. The TV page and phone app are unavailable for a few minutes."
    Stop-Servers

    $exitCode = Invoke-Logged $Git @('-C', $repoRoot, '-c', 'advice.detachedHead=false', 'checkout', '--detach', $latestTag)
    if ($exitCode -ne 0) {
        Add-LogLine "Could not switch to $latestTag (git exit code $exitCode)."
        Restore-PreviousVersion
        exit 1
    }

    if (-not (Build-Apps)) {
        Restore-PreviousVersion
        exit 1
    }

    Start-Servers
    Add-LogLine "Updated from $previousLabel to $latestTag."
    exit 0
}
catch {
    Add-LogLine "Unexpected error: $($_.Exception.Message)"
    if ($previousRef) {
        Restore-PreviousVersion
    }
    exit 1
}
