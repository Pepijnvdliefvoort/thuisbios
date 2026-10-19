<#
.SYNOPSIS
    Downloads freely licensed Blender open movies and builds a small Jellyfin test library.

.DESCRIPTION
    1. Downloads Big Buck Bunny (1080p zip) and Tears of Steel (720p mov) from download.blender.org
       into a staging folder (both CC BY 3.0, (c) Blender Foundation). Existing files are reused.
    2. If ffmpeg is on PATH, cuts short clips and writes them into <MediaRoot> with Jellyfin names:
         Movies\Big Buck Bunny (2008)\Big Buck Bunny (2008).mp4           H.264 + AAC
         Movies\Tears of Steel (2012)\Tears of Steel (2012).mkv           HEVC 10-bit + AAC
         Movies\Thuisbios Test DTS (2024)\...mkv                          DTS-only audio
         Movies\Thuisbios Test Subtitles (2024)\...mp4 + .nl.srt/.en.srt  external subtitles
         Shows\Thuisbios Test Show\Season 01\Thuisbios Test Show S01E01..E03.mkv
       Without ffmpeg the script stops after the download and prints how to install it.
    Test media is never committed to git. Run New-MediaLibrary.ps1 first (or let this script
    create the folders). Does not need administrator rights.

.PARAMETER MediaRoot
    Root of the Jellyfin media library, for example D:\Thuisbios\Media.

.PARAMETER StagingPath
    Where the big downloads go. Defaults to a folder in the user's temp directory.

.PARAMETER ClipSeconds
    Length of each test movie clip in seconds (30-600). Default 180.

.PARAMETER EpisodeSeconds
    Length of each test episode in seconds (10-300). Default 60.

.PARAMETER StartSeconds
    Where in the source film the clips start (skips the slow intro). Default 60.

.PARAMETER SkipDownload
    Do not download; use files already in the staging folder.

.PARAMETER Force
    Overwrite output files that already exist.

.EXAMPLE
    .\Get-TestMedia.ps1 -MediaRoot D:\Thuisbios\Media

.EXAMPLE
    .\Get-TestMedia.ps1 -MediaRoot D:\Thuisbios\Media -ClipSeconds 120 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [ValidateScript({
            if (-not [System.IO.Path]::IsPathRooted($_)) {
                throw "MediaRoot must be an absolute path, got '$_'."
            }
            $true
        })]
    [string]$MediaRoot,

    [ValidateNotNullOrEmpty()]
    [string]$StagingPath = (Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath 'thuisbios-staging'),

    [ValidateRange(30, 600)]
    [int]$ClipSeconds = 180,

    [ValidateRange(10, 300)]
    [int]$EpisodeSeconds = 60,

    [ValidateRange(0, 3600)]
    [int]$StartSeconds = 60,

    [switch]$SkipDownload,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath 'Thuisbios.Media.psm1') -Force

# Source: https://download.blender.org/demo/movies/ (directory listings checked 2026-10-19).
$sources = @(
    @{
        Name = 'Big Buck Bunny'
        Url  = 'https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_30fps_normal.mp4.zip'
        File = 'bbb_sunflower_1080p_30fps_normal.mp4.zip'
        Video = 'bbb_sunflower_1080p_30fps_normal.mp4'
    },
    @{
        Name = 'Tears of Steel'
        Url  = 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'
        File = 'tears_of_steel_720p.mov'
        Video = 'tears_of_steel_720p.mov'
    }
)

function Invoke-Download {
    param([string]$Url, [string]$Destination)
    if (Test-Path -LiteralPath $Destination) {
        Write-Host "Already downloaded: $Destination"
        return
    }
    if ($PSCmdlet.ShouldProcess($Url, "Download to $Destination")) {
        Write-Host "Downloading $Url"
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $previous = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue' # progress bar makes Windows PowerShell 5.1 downloads very slow
        try {
            Invoke-WebRequest -Uri $Url -OutFile "$Destination.part" -UseBasicParsing
            Move-Item -LiteralPath "$Destination.part" -Destination $Destination
        }
        finally {
            $ProgressPreference = $previous
        }
    }
}

function Invoke-Ffmpeg {
    param([string]$Kind, [string]$InputPath, [string]$OutputPath, [double]$Start, [double]$Duration)
    if ((Test-Path -LiteralPath $OutputPath) -and -not $Force) {
        Write-Host "Exists, skipped (use -Force to overwrite): $OutputPath"
        return
    }
    $dir = Split-Path -Path $OutputPath -Parent
    if ($PSCmdlet.ShouldProcess($OutputPath, "ffmpeg $Kind")) {
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
        $ffArgs = Get-FfmpegArguments -Kind $Kind -InputPath $InputPath -OutputPath $OutputPath -StartSeconds $Start -DurationSeconds $Duration
        Write-Host "Creating $OutputPath"
        & ffmpeg @ffArgs
        if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE for $OutputPath" }
    }
}

function Write-Srt {
    param([string]$Path, [string[]]$Lines)
    if ((Test-Path -LiteralPath $Path) -and -not $Force) { return }
    if ($PSCmdlet.ShouldProcess($Path, 'Write subtitle file')) {
        $dir = Split-Path -Path $Path -Parent
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
        [System.IO.File]::WriteAllText($Path, (New-SrtContent -Lines $Lines), (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "Creating $Path"
    }
}

# 1. Download -------------------------------------------------------------------------------
if (-not $WhatIfPreference -and -not (Test-Path -LiteralPath $StagingPath)) {
    New-Item -ItemType Directory -Path $StagingPath | Out-Null
}
if (-not $SkipDownload) {
    foreach ($s in $sources) {
        Invoke-Download -Url $s.Url -Destination (Join-Path -Path $StagingPath -ChildPath $s.File)
    }
}
$bbbZip = Join-Path -Path $StagingPath -ChildPath $sources[0].File
$bbbMp4 = Join-Path -Path $StagingPath -ChildPath $sources[0].Video
$tosMov = Join-Path -Path $StagingPath -ChildPath $sources[1].Video
if (-not (Test-Path -LiteralPath $bbbMp4) -and (Test-Path -LiteralPath $bbbZip) -and $PSCmdlet.ShouldProcess($bbbZip, 'Expand archive')) {
    Expand-Archive -LiteralPath $bbbZip -DestinationPath $StagingPath -Force
}

# 2. ffmpeg ---------------------------------------------------------------------------------
if (-not (Get-Command -Name ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Warning 'ffmpeg was not found on PATH, so no test library was built.'
    Write-Host 'Install it with:  winget install Gyan.FFmpeg'
    Write-Host 'Then open a NEW PowerShell window (so PATH is refreshed) and run this script again.'
    return
}
if (-not $WhatIfPreference -and -not ((Test-Path -LiteralPath $bbbMp4) -and (Test-Path -LiteralPath $tosMov))) {
    throw "Source files missing in $StagingPath. Run without -SkipDownload."
}

# 3. Build the test library -----------------------------------------------------------------
$movies = Join-Path -Path $MediaRoot -ChildPath 'Movies'
$shows = Join-Path -Path $MediaRoot -ChildPath 'Shows'

# Movie 1: H.264 + AAC in MP4 (plain direct play).
$bbbFolder = Get-MovieFolderName -Title 'Big Buck Bunny' -Year 2008
$bbbOut = Join-Path -Path (Join-Path -Path $movies -ChildPath $bbbFolder) -ChildPath (Get-MovieFileName -Title 'Big Buck Bunny' -Year 2008 -Extension mp4)
Invoke-Ffmpeg -Kind H264Aac -InputPath $bbbMp4 -OutputPath $bbbOut -Start $StartSeconds -Duration $ClipSeconds

# Movie 2: HEVC Main10 + AAC in MKV.
$tosFolder = Get-MovieFolderName -Title 'Tears of Steel' -Year 2012
$tosOut = Join-Path -Path (Join-Path -Path $movies -ChildPath $tosFolder) -ChildPath (Get-MovieFileName -Title 'Tears of Steel' -Year 2012 -Extension mkv)
Invoke-Ffmpeg -Kind Hevc10Bit -InputPath $tosMov -OutputPath $tosOut -Start $StartSeconds -Duration $ClipSeconds

# Movie 3: only a DTS audio track (the TV cannot play DTS, so Jellyfin must transcode the audio).
$dtsFolder = Get-MovieFolderName -Title 'Thuisbios Test DTS' -Year 2024
$dtsOut = Join-Path -Path (Join-Path -Path $movies -ChildPath $dtsFolder) -ChildPath (Get-MovieFileName -Title 'Thuisbios Test DTS' -Year 2024 -Extension mkv)
Invoke-Ffmpeg -Kind DtsAudio -InputPath $bbbOut -OutputPath $dtsOut -Start 0 -Duration $ClipSeconds

# Movie 4: external .srt subtitles next to the video.
$subFolder = Get-MovieFolderName -Title 'Thuisbios Test Subtitles' -Year 2024
$subName = Get-MovieFileName -Title 'Thuisbios Test Subtitles' -Year 2024 -Extension mp4
$subDir = Join-Path -Path $movies -ChildPath $subFolder
Invoke-Ffmpeg -Kind Remux -InputPath $bbbOut -OutputPath (Join-Path -Path $subDir -ChildPath $subName) -Start 0 -Duration $ClipSeconds
Write-Srt -Path (Join-Path -Path $subDir -ChildPath (Get-SubtitleFileName -VideoFileName $subName -Language nl)) `
    -Lines @('Dit is een Nederlandse testondertitel.', 'Thuisbios: ondertitels werken.', 'Einde van de test.')
Write-Srt -Path (Join-Path -Path $subDir -ChildPath (Get-SubtitleFileName -VideoFileName $subName -Language en)) `
    -Lines @('This is an English test subtitle.', 'Thuisbios: subtitles work.', 'End of the test.')

# Show: three short episodes cut back to back from Tears of Steel.
$showName = 'Thuisbios Test Show'
$seasonDir = Join-Path -Path (Join-Path -Path $shows -ChildPath (Get-ShowFolderName -Title $showName)) -ChildPath (Get-SeasonFolderName -Season 1)
foreach ($ep in 1..3) {
    $epOut = Join-Path -Path $seasonDir -ChildPath (Get-EpisodeFileName -Show $showName -Season 1 -Episode $ep -Extension mkv)
    Invoke-Ffmpeg -Kind Episode -InputPath $tosMov -OutputPath $epOut -Start ($StartSeconds + (($ep - 1) * $EpisodeSeconds)) -Duration $EpisodeSeconds
}

Write-Host ''
Write-Host "Done. Library root: $MediaRoot. Scan the libraries in Jellyfin (Dashboard > Libraries > Scan All Libraries)."
Write-Host 'Source films: (c) Blender Foundation, CC BY 3.0 (studio.blender.org). Do not commit this media to git.'
