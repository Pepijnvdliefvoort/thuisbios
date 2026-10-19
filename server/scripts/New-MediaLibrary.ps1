<#
.SYNOPSIS
    Creates the Thuisbios media folder layout (Movies and Shows) under a root folder.

.DESCRIPTION
    Creates <Root>\Movies and <Root>\Shows (names configurable). Existing folders are left alone,
    so the script is safe to run again. Does not need administrator rights, but the Jellyfin
    service account must be able to read the folder (see docs/server/windows-setup.md).

.PARAMETER Root
    Root folder of the media library, for example D:\Thuisbios\Media.

.PARAMETER Folders
    Sub folders to create. Defaults to Movies and Shows.

.EXAMPLE
    .\New-MediaLibrary.ps1 -Root D:\Thuisbios\Media

.EXAMPLE
    .\New-MediaLibrary.ps1 -Root D:\Thuisbios\Media -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [ValidateScript({
            if (-not [System.IO.Path]::IsPathRooted($_)) {
                throw "Root must be an absolute path, got '$_'."
            }
            $true
        })]
    [string]$Root,

    [ValidateNotNullOrEmpty()]
    [ValidatePattern('^[^\\/:*?"<>|]+$')]
    [string[]]$Folders = @('Movies', 'Shows')
)

$ErrorActionPreference = 'Stop'

$targets = @($Root) + @($Folders | ForEach-Object { Join-Path -Path $Root -ChildPath $_ })
foreach ($path in $targets) {
    if (Test-Path -LiteralPath $path -PathType Container) {
        Write-Verbose "Exists: $path"
    }
    elseif ($PSCmdlet.ShouldProcess($path, 'Create folder')) {
        New-Item -ItemType Directory -Path $path | Out-Null
        Write-Verbose "Created: $path"
    }
    $path
}
