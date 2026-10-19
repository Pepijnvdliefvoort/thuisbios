<#
.SYNOPSIS
    Pure helper functions for Jellyfin-style media naming and ffmpeg argument building.

.DESCRIPTION
    Nothing in this module touches the file system, the network or ffmpeg. Everything returns
    strings or string arrays so it can be unit tested with Pester on any platform.
    Compatible with Windows PowerShell 5.1 and PowerShell 7.
#>

Set-StrictMode -Version 2.0

function Get-SafeName {
    <#
    .SYNOPSIS
        Makes a title safe to use as a Windows file or folder name.
    .EXAMPLE
        Get-SafeName -Name 'Mission: Impossible?'   # Mission - Impossible
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [ValidateNotNullOrEmpty()]
        [string]$Name
    )
    process {
        $clean = $Name -replace ':', ' -'
        $clean = $clean -replace '[<>"/\\|?*]', ''
        $clean = $clean -replace '\s+', ' '
        $clean = $clean.Trim().TrimEnd('.').Trim()
        if ([string]::IsNullOrWhiteSpace($clean)) {
            throw "Name '$Name' contains no usable characters."
        }
        $clean
    }
}

function Get-MovieFolderName {
    <#
    .SYNOPSIS
        Returns the Jellyfin movie folder name: 'Title (Year)'.
    .EXAMPLE
        Get-MovieFolderName -Title 'Inception' -Year 2010   # Inception (2010)
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Title,
        [Parameter(Mandatory)][ValidateRange(1888, 2100)][int]$Year
    )
    '{0} ({1})' -f (Get-SafeName -Name $Title), $Year
}

function ConvertTo-Extension {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Extension
    )
    $ext = $Extension.Trim().TrimStart('.')
    if ($ext -notmatch '^[A-Za-z0-9]{1,5}$') {
        throw "Invalid file extension '$Extension'."
    }
    '.' + $ext.ToLowerInvariant()
}

function Get-MovieFileName {
    <#
    .SYNOPSIS
        Returns the movie file name: 'Title (Year).ext'.
    .EXAMPLE
        Get-MovieFileName -Title 'Inception' -Year 2010 -Extension mkv   # Inception (2010).mkv
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Title,
        [Parameter(Mandatory)][ValidateRange(1888, 2100)][int]$Year,
        [Parameter(Mandatory)][string]$Extension
    )
    (Get-MovieFolderName -Title $Title -Year $Year) + (ConvertTo-Extension -Extension $Extension)
}

function Get-ShowFolderName {
    <#
    .SYNOPSIS
        Returns the series folder name: 'Show' or 'Show (Year)' when a year is given.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Title,
        [ValidateRange(0, 2100)][int]$Year = 0
    )
    $name = Get-SafeName -Name $Title
    if ($Year -gt 0) { '{0} ({1})' -f $name, $Year } else { $name }
}

function Get-SeasonFolderName {
    <#
    .SYNOPSIS
        Returns 'Season 01' (or 'Specials' for season 0).
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateRange(0, 99)][int]$Season
    )
    if ($Season -eq 0) { 'Specials' } else { 'Season {0:00}' -f $Season }
}

function Get-EpisodeFileName {
    <#
    .SYNOPSIS
        Returns the episode file name: 'Show S01E01.ext' (or 'Show S01E01-E02.ext').
    .EXAMPLE
        Get-EpisodeFileName -Show 'Breaking Bad' -Season 1 -Episode 1 -Extension mkv
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Show,
        [Parameter(Mandatory)][ValidateRange(0, 99)][int]$Season,
        [Parameter(Mandatory)][ValidateRange(1, 999)][int]$Episode,
        [ValidateRange(0, 999)][int]$EndEpisode = 0,
        [Parameter(Mandatory)][string]$Extension
    )
    if ($EndEpisode -ne 0 -and $EndEpisode -le $Episode) {
        throw 'EndEpisode must be greater than Episode.'
    }
    $code = 'S{0:00}E{1:00}' -f $Season, $Episode
    if ($EndEpisode -gt 0) { $code += '-E{0:00}' -f $EndEpisode }
    '{0} {1}{2}' -f (Get-SafeName -Name $Show), $code, (ConvertTo-Extension -Extension $Extension)
}

function Get-SubtitleFileName {
    <#
    .SYNOPSIS
        Returns the external subtitle name next to a video: 'Video.nl.srt' / 'Video.nl.forced.srt'.
    .EXAMPLE
        Get-SubtitleFileName -VideoFileName 'Inception (2010).mkv' -Language nl
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$VideoFileName,
        [Parameter(Mandatory)][ValidatePattern('^[A-Za-z]{2,3}$')][string]$Language,
        [switch]$Forced,
        [ValidateSet('srt', 'vtt', 'ass')][string]$Format = 'srt'
    )
    $base = [System.IO.Path]::GetFileNameWithoutExtension($VideoFileName)
    $name = '{0}.{1}' -f $base, $Language.ToLowerInvariant()
    if ($Forced) { $name += '.forced' }
    '{0}.{1}' -f $name, $Format
}

function Format-SrtTimestamp {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateRange(0, 359999)][double]$Seconds
    )
    $ts = [TimeSpan]::FromSeconds($Seconds)
    '{0:00}:{1:00}:{2:00},{3:000}' -f [int][math]::Floor($ts.TotalHours), $ts.Minutes, $ts.Seconds, $ts.Milliseconds
}

function New-SrtContent {
    <#
    .SYNOPSIS
        Builds SubRip (.srt) text with one cue per line, each shown for CueSeconds.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string[]]$Lines,
        [ValidateRange(1, 60)][double]$CueSeconds = 4,
        [ValidateRange(0, 3600)][double]$StartSeconds = 1
    )
    $sb = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $start = $StartSeconds + ($i * ($CueSeconds + 1))
        $end = $start + $CueSeconds
        [void]$sb.AppendLine([string]($i + 1))
        [void]$sb.AppendLine('{0} --> {1}' -f (Format-SrtTimestamp -Seconds $start), (Format-SrtTimestamp -Seconds $end))
        [void]$sb.AppendLine($Lines[$i])
        [void]$sb.AppendLine()
    }
    $sb.ToString()
}

function Get-FfmpegArguments {
    <#
    .SYNOPSIS
        Builds the ffmpeg argument list for one test-media variant.
    .DESCRIPTION
        Kind:
          H264Aac    H.264 8-bit + AAC stereo (direct plays on the TV).
          Hevc10Bit  HEVC Main10 + AAC (direct plays on the TV; tests 10-bit).
          DtsAudio   copies video, re-encodes audio to DTS only (forces audio transcode).
          Remux      copies video and audio unchanged (used for the external-subtitle movie).
          Episode    H.264 + AAC, intended for a short series episode.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('H264Aac', 'Hevc10Bit', 'DtsAudio', 'Remux', 'Episode')]
        [string]$Kind,
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$InputPath,
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$OutputPath,
        [ValidateRange(0, 86400)][double]$StartSeconds = 0,
        [Parameter(Mandatory)][ValidateRange(1, 3600)][double]$DurationSeconds
    )
    $inv = [System.Globalization.CultureInfo]::InvariantCulture
    $ffArgs = New-Object System.Collections.Generic.List[string]
    $ffArgs.AddRange([string[]]@('-hide_banner', '-loglevel', 'error', '-nostdin', '-y'))
    if ($StartSeconds -gt 0) { $ffArgs.AddRange([string[]]@('-ss', $StartSeconds.ToString($inv))) }
    $ffArgs.AddRange([string[]]@('-t', $DurationSeconds.ToString($inv), '-i', $InputPath, '-map', '0:v:0', '-map', '0:a:0'))

    switch ($Kind) {
        'H264Aac' {
            $ffArgs.AddRange([string[]]@('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart'))
        }
        'Hevc10Bit' {
            $ffArgs.AddRange([string[]]@('-c:v', 'libx265', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p10le',
                    '-c:a', 'aac', '-b:a', '128k', '-ac', '2'))
        }
        'DtsAudio' {
            $ffArgs.AddRange([string[]]@('-c:v', 'copy', '-c:a', 'dca', '-strict', '-2', '-b:a', '768k', '-ac', '2'))
        }
        'Remux' {
            $ffArgs.AddRange([string[]]@('-c', 'copy'))
        }
        'Episode' {
            $ffArgs.AddRange([string[]]@('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '128k', '-ac', '2'))
        }
    }
    $ffArgs.Add($OutputPath)
    , $ffArgs.ToArray()
}

Export-ModuleMember -Function Get-SafeName, Get-MovieFolderName, Get-MovieFileName, Get-ShowFolderName,
Get-SeasonFolderName, Get-EpisodeFileName, Get-SubtitleFileName, New-SrtContent, Get-FfmpegArguments
