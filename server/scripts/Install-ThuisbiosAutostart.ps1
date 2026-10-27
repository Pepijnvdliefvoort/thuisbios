<#
.SYNOPSIS
    Makes the Thuisbios TV page and phone app start by themselves when Windows starts.

.DESCRIPTION
    Run once from PowerShell "as administrator" in the project folder. Run it again to repair
    or refresh the setup. It:
      - stops the servers if they are running,
      - installs and builds the TV page and the phone app (unless -SkipBuild),
      - allows the two ports on the home network in the Windows Firewall,
      - creates two scheduled tasks (folder "Thuisbios") that start at boot, without anyone
        signing in and without a window,
      - creates a third task, "Update" (unless -NoAutoUpdate), that checks GitHub for a new
        release a few minutes after the PC starts and then every hour, and installs it with
        Update-Thuisbios.ps1 (needs Git for Windows), and
      - starts them now.
    The project folder stays on whatever is checked out now. The first run of the Update task
    moves it to the newest release.
    Uses only Windows Task Scheduler. Windows only.

.PARAMETER SkipBuild
    Do not run "npm ci" and the builds (only refresh the tasks and firewall rules).

.PARAMETER NoAutoUpdate
    Do not install the automatic updates. An existing Update task is removed.

.EXAMPLE
    .\Install-ThuisbiosAutostart.ps1

.EXAMPLE
    .\Install-ThuisbiosAutostart.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$SkipBuild,

    [switch]$NoAutoUpdate
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$startScript = Join-Path $PSScriptRoot 'Start-ThuisbiosServer.ps1'
$taskPath = '\Thuisbios\'
$logDir = Join-Path (Join-Path $env:USERPROFILE '.thuisbios') 'logs'

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    Write-Error 'Node.js is not installed (npm.cmd was not found). Install Node.js from https://nodejs.org and open a new PowerShell window.' -ErrorAction Continue
    exit 1
}
$npmPath = $npmCommand.Source

$updateScript = Join-Path $PSScriptRoot 'Update-Thuisbios.ps1'
$updateTask = 'Update'
$gitPath = $null
if (-not $NoAutoUpdate) {
    $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
    if (-not $gitCommand) {
        Write-Error 'Git is not installed (git.exe was not found), which automatic updates need. Install Git for Windows from https://git-scm.com and open a new PowerShell window, or run this script with -NoAutoUpdate.' -ErrorAction Continue
        exit 1
    }
    $gitPath = $gitCommand.Source
}

$servers = @(
    @{ Task = 'TV page'; App = 'tv'; Port = 4173; Rule = 'Thuisbios TV page (TCP 4173)' },
    @{ Task = 'Phone app'; App = 'remote'; Port = 4174; Rule = 'Thuisbios phone app (TCP 4174)' }
)

Write-Host 'Stopping the TV page and phone app if they are running...'
Write-Host 'Note: close any old PowerShell windows that run "npm run preview", they block the update.'
foreach ($server in $servers) {
    $task = Get-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -ErrorAction SilentlyContinue
    if ($task -and $PSCmdlet.ShouldProcess($server.Task, 'Stop scheduled task')) {
        Stop-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -ErrorAction SilentlyContinue
    }
}
foreach ($server in $servers) {
    $listeners = Get-NetTCPConnection -LocalPort $server.Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        if ($PSCmdlet.ShouldProcess("port $($server.Port)", 'Stop the program using this port')) {
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}
Start-Sleep -Seconds 2

if (-not $SkipBuild) {
    $steps = @(
        @{ Text = 'Installing packages (this takes a few minutes)'; Args = @('ci') },
        @{ Text = 'Building the TV page'; Args = @('run', 'build', '-w', 'apps/tv') },
        @{ Text = 'Building the phone app'; Args = @('run', 'build', '-w', 'apps/remote') }
    )
    foreach ($step in $steps) {
        if ($PSCmdlet.ShouldProcess($repoRoot, $step.Text)) {
            Write-Host "$($step.Text)..."
            Push-Location $repoRoot
            try {
                & $npmPath @($step.Args)
                $exitCode = $LASTEXITCODE
            }
            finally {
                Pop-Location
            }
            if ($exitCode -ne 0) {
                Write-Error "Step failed: $($step.Text) (npm exit code $exitCode). Nothing was started. Close any old 'npm run preview' windows and run this script again." -ErrorAction Continue
                exit 1
            }
        }
    }
}

# The servers run in the background, so Windows cannot show its usual "allow access" question.
foreach ($server in $servers) {
    $settings = @{
        Direction     = 'Inbound'
        Action        = 'Allow'
        Protocol      = 'TCP'
        LocalPort     = $server.Port
        Profile       = 'Private'
        RemoteAddress = 'LocalSubnet'
        Enabled       = 'True'
    }
    $existing = Get-NetFirewallRule -DisplayName $server.Rule -ErrorAction SilentlyContinue
    if ($existing) {
        if ($PSCmdlet.ShouldProcess($server.Rule, 'Update firewall rule')) {
            Set-NetFirewallRule -DisplayName $server.Rule @settings
            Write-Host "Firewall updated: $($server.Rule)"
        }
    }
    elseif ($PSCmdlet.ShouldProcess($server.Rule, 'Create firewall rule')) {
        New-NetFirewallRule -DisplayName $server.Rule @settings | Out-Null
        Write-Host "Firewall created: $($server.Rule)"
    }
}

# The tasks run as the person who opened this window, so their .thuisbios settings are found.
$userId = "$env:USERDOMAIN\$env:USERNAME"
foreach ($server in $servers) {
    if (-not $PSCmdlet.ShouldProcess($server.Task, 'Register scheduled task')) { continue }
    $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -App {1} -Npm "{2}"' -f $startScript, $server.App, $npmPath
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $repoRoot
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType S4U -RunLevel Limited
    $taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -Action $action `
        -Trigger $trigger -Principal $principal -Settings $taskSettings `
        -Description "Starts the Thuisbios $($server.Task) when Windows starts." -Force | Out-Null
    Write-Host "Task registered: $taskPath$($server.Task)"
}

if ($NoAutoUpdate) {
    $existingUpdate = Get-ScheduledTask -TaskPath $taskPath -TaskName $updateTask -ErrorAction SilentlyContinue
    if ($existingUpdate -and $PSCmdlet.ShouldProcess($updateTask, 'Stop and remove scheduled task')) {
        Stop-ScheduledTask -TaskPath $taskPath -TaskName $updateTask -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskPath $taskPath -TaskName $updateTask -Confirm:$false
        Write-Host "Task removed: $taskPath$updateTask"
    }
}
elseif ($PSCmdlet.ShouldProcess($updateTask, 'Register scheduled task')) {
    # Needs administrator rights (RunLevel Highest) to stop and start the other two tasks.
    $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Git "{1}" -Npm "{2}"' -f $updateScript, $gitPath, $npmPath
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $repoRoot
    $atStartup = New-ScheduledTaskTrigger -AtStartup
    $atStartup.Delay = 'PT5M'
    # Without a duration the repetition goes on forever.
    $hourly = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType S4U -RunLevel Highest
    $taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskPath $taskPath -TaskName $updateTask -Action $action `
        -Trigger @($atStartup, $hourly) -Principal $principal -Settings $taskSettings `
        -Description 'Checks GitHub for a new Thuisbios release and installs it.' -Force | Out-Null
    Write-Host "Task registered: $taskPath$updateTask"
}

if ($WhatIfPreference) {
    Write-Host 'WhatIf: nothing was changed.'
    return
}

foreach ($server in $servers) {
    Start-ScheduledTask -TaskPath $taskPath -TaskName $server.Task
}

Write-Host 'Waiting for the servers to start...'
$pending = @($servers)
$deadline = (Get-Date).AddSeconds(30)
while ($pending.Count -gt 0 -and (Get-Date) -lt $deadline) {
    $pending = @($pending | Where-Object {
            -not (Get-NetTCPConnection -LocalPort $_.Port -State Listen -ErrorAction SilentlyContinue)
        })
    if ($pending.Count -gt 0) { Start-Sleep -Seconds 1 }
}

# Address of the network card that has a route to the internet (the usual home connection).
$address = $null
$config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
if ($config) { $address = @($config.IPv4Address)[0].IPAddress }
if (-not $address) { $address = "this PC's address" }

Write-Host ''
if ($pending.Count -eq 0) {
    Write-Host 'Done. Thuisbios now starts by itself when the PC starts.'
}
else {
    foreach ($server in $pending) {
        Write-Host "The $($server.Task) did not start within 30 seconds. Look at the log: $(Join-Path $logDir ($server.App + '.log'))"
    }
}
Write-Host "  TV page:   http://${address}:4173"
Write-Host "  Phone app: http://${address}:4174"
Write-Host "Log files:   $logDir"
if (-not $NoAutoUpdate) {
    Write-Host 'This PC now follows the releases: it checks for a new one a few minutes after it starts and then every hour.'
    Write-Host "Update log:  $(Join-Path $logDir 'update.log')"
    # Look for a newer release right away; if there is one, the pages restart for a few minutes.
    Start-ScheduledTask -TaskPath $taskPath -TaskName $updateTask
}
Write-Host 'To remove it again, run Uninstall-ThuisbiosAutostart.ps1 as administrator.'
