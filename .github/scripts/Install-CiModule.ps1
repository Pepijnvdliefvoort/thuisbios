<#
.SYNOPSIS
Installs a PowerShell module from the PowerShell Gallery for CI, with retries.

.DESCRIPTION
Skips the install when a matching version is already available. Otherwise retries
Install-Module (up to 5 attempts, waiting 10, 20, 30 and 40 seconds in between)
because the PowerShell Gallery download occasionally fails.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$MinimumVersion,

    [string]$MaximumVersion
)

$ErrorActionPreference = 'Stop'

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$installed = Get-Module -ListAvailable -Name $Name | Where-Object {
    (-not $MinimumVersion -or $_.Version -ge [version]$MinimumVersion) -and
    (-not $MaximumVersion -or $_.Version -le [version]$MaximumVersion)
}
if ($installed) {
    $found = ($installed | Sort-Object Version -Descending | Select-Object -First 1).Version
    Write-Host "$Name $found is already available, skipping install."
    return
}

$installParams = @{
    Name               = $Name
    Scope              = 'CurrentUser'
    Force              = $true
    SkipPublisherCheck = $true
    Repository         = 'PSGallery'
}
if ($MinimumVersion) { $installParams.MinimumVersion = $MinimumVersion }
if ($MaximumVersion) { $installParams.MaximumVersion = $MaximumVersion }

$maxAttempts = 5
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
        Install-Module @installParams
        Write-Host "Installed $Name."
        return
    }
    catch {
        if ($attempt -eq $maxAttempts) {
            throw "Failed to install $Name after $maxAttempts attempts: $($_.Exception.Message)"
        }
        $delay = 10 * $attempt
        Write-Host "Attempt $attempt of $maxAttempts to install $Name failed: $($_.Exception.Message)"
        Write-Host "Retrying in $delay seconds..."
        Start-Sleep -Seconds $delay
    }
}
