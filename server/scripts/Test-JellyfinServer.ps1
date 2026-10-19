<#
.SYNOPSIS
    Checks that a Jellyfin server answers on /System/Info/Public.

.DESCRIPTION
    Calls http://<Server>:<Port>/System/Info/Public (no login needed) and prints server name,
    version and id. When Server is a loopback name, it also tries the LAN address Jellyfin
    reports, as a hint whether other devices can reach it. UDP discovery (7359) cannot be
    tested from here. Exits with 0 on success and 1 on failure.

.PARAMETER Server
    Host name or IP address. Default localhost. Use the PC's LAN IP from another device.

.PARAMETER Port
    TCP port. Default 8096.

.PARAMETER TimeoutSec
    Request timeout in seconds. Default 5.

.EXAMPLE
    .\Test-JellyfinServer.ps1

.EXAMPLE
    .\Test-JellyfinServer.ps1 -Server 192.168.1.50
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [ValidatePattern('^[A-Za-z0-9._:-]+$')]
    [string]$Server = 'localhost',

    [ValidateRange(1, 65535)]
    [int]$Port = 8096,

    [ValidateRange(1, 120)]
    [int]$TimeoutSec = 5
)

$ErrorActionPreference = 'Stop'

function Get-PublicInfo {
    param([string]$HostName, [int]$PortNumber, [int]$Timeout)
    $uri = 'http://{0}:{1}/System/Info/Public' -f $HostName, $PortNumber
    Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $Timeout -UseBasicParsing
}

try {
    $info = Get-PublicInfo -HostName $Server -PortNumber $Port -Timeout $TimeoutSec
}
catch {
    Write-Host "FAIL: no answer from http://${Server}:${Port} ($($_.Exception.Message))"
    Write-Host 'Check: is the Jellyfin service running, and is the firewall rule in place (Set-JellyfinFirewall.ps1)?'
    exit 1
}

Write-Host "Server name : $($info.ServerName)"
Write-Host "Version     : $($info.Version)"
Write-Host "Product     : $($info.ProductName)"
Write-Host "Server id   : $($info.Id)"
Write-Host "Wizard done : $($info.StartupWizardCompleted)"
Write-Host "Local addr  : $($info.LocalAddress)"

$loopback = @('localhost', '127.0.0.1', '::1')
if ($loopback -contains $Server.ToLowerInvariant()) {
    $lan = $null
    if ($info.LocalAddress -match '^https?://([^:/]+)') { $lan = $Matches[1] }
    if ($lan -and ($loopback -notcontains $lan.ToLowerInvariant())) {
        try {
            $null = Get-PublicInfo -HostName $lan -PortNumber $Port -Timeout $TimeoutSec
            Write-Host "LAN         : reachable via $lan (a phone on the same Wi-Fi should connect to http://${lan}:${Port})"
        }
        catch {
            Write-Host "LAN         : NOT reachable via $lan - check the firewall rule and that the network profile is Private."
            exit 1
        }
    }
    else {
        Write-Host 'LAN         : unknown (run this script with -Server <LAN IP> from another device).'
    }
}
else {
    Write-Host "LAN         : reachable from this device via $Server"
}
Write-Host 'OK'
exit 0
