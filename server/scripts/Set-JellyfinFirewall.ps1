<#
.SYNOPSIS
    Adds or updates the inbound Windows Firewall rules Jellyfin needs on the home network.

.DESCRIPTION
    Creates two inbound Allow rules on the Private profile, limited to the local subnet:
      - TCP 8096 (Jellyfin HTTP, web UI, API and streaming)
      - UDP 7359 (Jellyfin client auto-discovery)
    Idempotent: when a rule with the same display name exists it is updated, not duplicated.
    Requires an elevated (administrator) PowerShell. Windows only.

.PARAMETER HttpPort
    TCP port of Jellyfin. Default 8096.

.PARAMETER DiscoveryPort
    UDP discovery port. Default 7359.

.PARAMETER Remove
    Removes the rules again.

.EXAMPLE
    .\Set-JellyfinFirewall.ps1

.EXAMPLE
    .\Set-JellyfinFirewall.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateRange(1, 65535)]
    [int]$HttpPort = 8096,

    [ValidateRange(1, 65535)]
    [int]$DiscoveryPort = 7359,

    [switch]$Remove
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

$rules = @(
    @{ Name = 'Thuisbios Jellyfin HTTP (TCP)'; Protocol = 'TCP'; Port = $HttpPort },
    @{ Name = 'Thuisbios Jellyfin Discovery (UDP)'; Protocol = 'UDP'; Port = $DiscoveryPort }
)

foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($Remove) {
        if ($existing -and $PSCmdlet.ShouldProcess($rule.Name, 'Remove firewall rule')) {
            $existing | Remove-NetFirewallRule
            Write-Host "Removed: $($rule.Name)"
        }
        continue
    }

    $settings = @{
        Direction     = 'Inbound'
        Action        = 'Allow'
        Protocol      = $rule.Protocol
        LocalPort     = $rule.Port
        Profile       = 'Private'
        RemoteAddress = 'LocalSubnet'
        Enabled       = 'True'
    }
    if ($existing) {
        if ($PSCmdlet.ShouldProcess($rule.Name, 'Update firewall rule')) {
            Set-NetFirewallRule -DisplayName $rule.Name @settings
            Write-Host "Updated: $($rule.Name)"
        }
    }
    elseif ($PSCmdlet.ShouldProcess($rule.Name, 'Create firewall rule')) {
        New-NetFirewallRule -DisplayName $rule.Name @settings | Out-Null
        Write-Host "Created: $($rule.Name)"
    }
}
