# Helper functions for Update-Thuisbios.ps1. Dot-source this file; it does nothing by itself.
# Kept separate so the Pester tests can use them without running an update.

function ConvertTo-ReleaseVersion {
    # "v1.2.3" -> [version] 1.2.3, or $null when the text is not a release tag.
    param([string]$Tag)
    if ($Tag -match '^v(\d+\.\d+\.\d+)$') {
        $parsed = $null
        if ([version]::TryParse($Matches[1], [ref]$parsed)) { return $parsed }
    }
    return $null
}

function Get-LatestReleaseTag {
    # Returns the highest release tag (vX.Y.Z) as text, or $null when there is none.
    # Versions are compared as numbers, so v0.10.0 is newer than v0.9.0.
    param([string[]]$Tags)
    $best = $null
    $bestVersion = $null
    foreach ($tag in @($Tags)) {
        $tag = "$tag".Trim()
        $version = ConvertTo-ReleaseVersion $tag
        if ($null -eq $version) { continue }
        if ($null -eq $bestVersion -or $version -gt $bestVersion) {
            $best = $tag
            $bestVersion = $version
        }
    }
    return $best
}

function Test-UpdateNeeded {
    # $true when the project folder should move to the latest release.
    #   Current: release tag at HEAD, or empty/$null when HEAD is not on a release (for example "develop").
    #   Latest:  highest release tag.
    #   Force:   also rebuild when already on the latest release.
    param(
        [string]$Current,
        [Parameter(Mandatory)][string]$Latest,
        [switch]$Force
    )
    $currentVersion = ConvertTo-ReleaseVersion $Current
    if ($null -eq $currentVersion) { return $true }
    $latestVersion = ConvertTo-ReleaseVersion $Latest
    if ($null -eq $latestVersion) { return $false }
    if ($currentVersion -gt $latestVersion) { return $false }
    if ($currentVersion -eq $latestVersion) { return [bool]$Force }
    return $true
}
