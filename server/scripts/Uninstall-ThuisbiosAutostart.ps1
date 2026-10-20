<#
.SYNOPSIS
    Turns off the automatic start of the Thuisbios TV page and phone app.

.DESCRIPTION
    Stops and removes the two scheduled tasks created by Install-ThuisbiosAutostart.ps1, stops
    the servers and removes their firewall rules. Log files and your settings in
    %USERPROFILE%\.thuisbios are left alone. Safe to run when nothing is installed.
    Requires an elevated (administrator) PowerShell. Windows only.

.EXAMPLE
    .\Uninstall-ThuisbiosAutostart.ps1
#>
[CmdletBinding(SupportsShouldProcess)]
param()

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

$taskPath = '\Thuisbios\'
$servers = @(
    @{ Task = 'TV page'; Port = 4173; Rule = 'Thuisbios TV page (TCP 4173)' },
    @{ Task = 'Phone app'; Port = 4174; Rule = 'Thuisbios phone app (TCP 4174)' }
)

foreach ($server in $servers) {
    $task = Get-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -ErrorAction SilentlyContinue
    if ($task -and $PSCmdlet.ShouldProcess($server.Task, 'Stop and remove scheduled task')) {
        Stop-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskPath $taskPath -TaskName $server.Task -Confirm:$false
        Write-Host "Removed task: $($server.Task)"
    }
}

# Remove the empty "Thuisbios" folder in Task Scheduler (best effort).
if ($PSCmdlet.ShouldProcess($taskPath, 'Remove empty task folder')) {
    try {
        $service = New-Object -ComObject 'Schedule.Service'
        $service.Connect()
        $service.GetFolder('\').DeleteFolder('Thuisbios', 0)
    }
    catch {
        Write-Verbose "Task folder not removed: $($_.Exception.Message)"
    }
}

foreach ($server in $servers) {
    $listeners = Get-NetTCPConnection -LocalPort $server.Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        if ($PSCmdlet.ShouldProcess("port $($server.Port)", 'Stop the program using this port')) {
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped the $($server.Task)"
        }
    }
}

foreach ($server in $servers) {
    $rule = Get-NetFirewallRule -DisplayName $server.Rule -ErrorAction SilentlyContinue
    if ($rule -and $PSCmdlet.ShouldProcess($server.Rule, 'Remove firewall rule')) {
        $rule | Remove-NetFirewallRule
        Write-Host "Removed firewall rule: $($server.Rule)"
    }
}

Write-Host 'Done. Thuisbios no longer starts by itself. Your log files and settings were kept.'
Write-Host 'You can still start the servers by hand with "npm run preview -w apps/tv" and "npm run preview -w apps/remote".'
