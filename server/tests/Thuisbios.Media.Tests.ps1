BeforeAll {
    Import-Module ([System.IO.Path]::Combine($PSScriptRoot, '..', 'scripts', 'Thuisbios.Media.psm1')) -Force
}

Describe 'Get-SafeName' {
    It 'keeps normal titles' {
        Get-SafeName -Name 'Big Buck Bunny' | Should -Be 'Big Buck Bunny'
    }
    It 'replaces a colon and strips invalid characters' {
        Get-SafeName -Name 'Mission: Impossible?' | Should -Be 'Mission - Impossible'
        Get-SafeName -Name 'AC/DC <Live>' | Should -Be 'ACDC Live'
    }
    It 'collapses whitespace and trailing dots' {
        Get-SafeName -Name '  Dr.   Who... ' | Should -Be 'Dr. Who'
    }
    It 'rejects names with nothing left' {
        { Get-SafeName -Name '???' } | Should -Throw
        { Get-SafeName -Name '' } | Should -Throw
    }
}

Describe 'Movie names' {
    It 'builds the folder name' {
        Get-MovieFolderName -Title 'Inception' -Year 2010 | Should -Be 'Inception (2010)'
    }
    It 'builds the file name and normalises the extension' {
        Get-MovieFileName -Title 'Inception' -Year 2010 -Extension 'MKV' | Should -Be 'Inception (2010).mkv'
        Get-MovieFileName -Title 'Inception' -Year 2010 -Extension '.mp4' | Should -Be 'Inception (2010).mp4'
    }
    It 'rejects a bad year or extension' {
        { Get-MovieFolderName -Title 'X' -Year 1500 } | Should -Throw
        { Get-MovieFileName -Title 'X' -Year 2000 -Extension 'a/b' } | Should -Throw
    }
}

Describe 'Show names' {
    It 'builds show and season folders' {
        Get-ShowFolderName -Title 'Breaking Bad' | Should -Be 'Breaking Bad'
        Get-ShowFolderName -Title 'Doctor Who' -Year 2005 | Should -Be 'Doctor Who (2005)'
        Get-SeasonFolderName -Season 1 | Should -Be 'Season 01'
        Get-SeasonFolderName -Season 12 | Should -Be 'Season 12'
        Get-SeasonFolderName -Season 0 | Should -Be 'Specials'
    }
    It 'builds episode file names' {
        Get-EpisodeFileName -Show 'Thuisbios Test Show' -Season 1 -Episode 1 -Extension mkv |
            Should -Be 'Thuisbios Test Show S01E01.mkv'
        Get-EpisodeFileName -Show 'Show' -Season 2 -Episode 10 -Extension mp4 | Should -Be 'Show S02E10.mp4'
    }
    It 'supports multi-episode files' {
        Get-EpisodeFileName -Show 'Show' -Season 1 -Episode 1 -EndEpisode 2 -Extension mkv |
            Should -Be 'Show S01E01-E02.mkv'
        { Get-EpisodeFileName -Show 'Show' -Season 1 -Episode 2 -EndEpisode 2 -Extension mkv } | Should -Throw
    }
    It 'rejects episode 0' {
        { Get-EpisodeFileName -Show 'Show' -Season 1 -Episode 0 -Extension mkv } | Should -Throw
    }
}

Describe 'Get-SubtitleFileName' {
    It 'names subtitles after the video' {
        Get-SubtitleFileName -VideoFileName 'Inception (2010).mkv' -Language nl | Should -Be 'Inception (2010).nl.srt'
    }
    It 'adds the forced flag' {
        Get-SubtitleFileName -VideoFileName 'A (2000).mp4' -Language EN -Forced | Should -Be 'A (2000).en.forced.srt'
    }
    It 'rejects a bad language code' {
        { Get-SubtitleFileName -VideoFileName 'A.mkv' -Language 'dutch' } | Should -Throw
    }
}

Describe 'New-SrtContent' {
    It 'writes numbered cues with timestamps' {
        $srt = New-SrtContent -Lines @('One', 'Two') -CueSeconds 4 -StartSeconds 1
        $srt | Should -Match '(?m)^1\r?$'
        $srt | Should -Match '00:00:01,000 --> 00:00:05,000'
        $srt | Should -Match '00:00:06,000 --> 00:00:10,000'
        $srt | Should -Match 'Two'
    }
}

Describe 'Get-FfmpegArguments' {
    It 'builds H.264 + AAC arguments' {
        $a = Get-FfmpegArguments -Kind H264Aac -InputPath 'in.mp4' -OutputPath 'out.mp4' -StartSeconds 60 -DurationSeconds 180
        $a | Should -Contain 'libx264'
        $a | Should -Contain 'aac'
        $a[-1] | Should -Be 'out.mp4'
        $a[([Array]::IndexOf($a, '-ss') + 1)] | Should -Be '60'
        $a[([Array]::IndexOf($a, '-t') + 1)] | Should -Be '180'
    }
    It 'builds HEVC 10-bit arguments' {
        $a = Get-FfmpegArguments -Kind Hevc10Bit -InputPath 'in.mov' -OutputPath 'out.mkv' -DurationSeconds 60
        $a | Should -Contain 'libx265'
        $a | Should -Contain 'yuv420p10le'
        $a | Should -Not -Contain '-ss'
    }
    It 'builds DTS-only arguments' {
        $a = Get-FfmpegArguments -Kind DtsAudio -InputPath 'in.mp4' -OutputPath 'out.mkv' -DurationSeconds 60
        $a | Should -Contain 'dca'
        $a[([Array]::IndexOf($a, '-c:v') + 1)] | Should -Be 'copy'
    }
    It 'maps only one video and one audio stream' {
        $a = Get-FfmpegArguments -Kind Remux -InputPath 'in.mp4' -OutputPath 'out.mp4' -DurationSeconds 10
        ($a | Where-Object { $_ -eq '-map' }).Count | Should -Be 2
    }
    It 'rejects an unknown kind' {
        { Get-FfmpegArguments -Kind Nope -InputPath 'a' -OutputPath 'b' -DurationSeconds 1 } | Should -Throw
    }
}
