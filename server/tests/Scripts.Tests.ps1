BeforeAll {
    $script:ScriptDir = [System.IO.Path]::Combine($PSScriptRoot, '..', 'scripts')
    function script:Get-Param([string]$Script, [string]$Name) {
        (Get-Command (Join-Path $script:ScriptDir $Script)).Parameters[$Name]
    }
}

Describe 'Script parameter contracts' {
    It '<Script> declares SupportsShouldProcess: <Expected>' -ForEach @(
        @{ Script = 'New-MediaLibrary.ps1'; Expected = $true }
        @{ Script = 'Set-JellyfinFirewall.ps1'; Expected = $true }
        @{ Script = 'Get-TestMedia.ps1'; Expected = $true }
        @{ Script = 'Test-JellyfinServer.ps1'; Expected = $false }
    ) {
        $cmd = Get-Command (Join-Path $script:ScriptDir $Script)
        [bool]($cmd.Parameters.ContainsKey('WhatIf')) | Should -Be $Expected
    }

    It 'New-MediaLibrary requires Root' {
        (Get-Param 'New-MediaLibrary.ps1' 'Root').Attributes |
            Where-Object { $_ -is [System.Management.Automation.ParameterAttribute] } |
            ForEach-Object { $_.Mandatory } | Should -Contain $true
    }
    It 'Get-TestMedia requires MediaRoot' {
        (Get-Param 'Get-TestMedia.ps1' 'MediaRoot').Attributes |
            Where-Object { $_ -is [System.Management.Automation.ParameterAttribute] } |
            ForEach-Object { $_.Mandatory } | Should -Contain $true
    }
}

Describe 'New-MediaLibrary.ps1' {
    BeforeAll { $script:Script = [System.IO.Path]::Combine($PSScriptRoot, '..', 'scripts', 'New-MediaLibrary.ps1') }

    It 'rejects a relative root' {
        { & $script:Script -Root 'relative\path' } | Should -Throw
    }
    It 'creates Movies and Shows' {
        $root = Join-Path $TestDrive 'Media'
        & $script:Script -Root $root | Out-Null
        Test-Path (Join-Path $root 'Movies') | Should -BeTrue
        Test-Path (Join-Path $root 'Shows') | Should -BeTrue
    }
    It 'is idempotent' {
        $root = Join-Path $TestDrive 'Media2'
        & $script:Script -Root $root | Out-Null
        { & $script:Script -Root $root | Out-Null } | Should -Not -Throw
    }
    It 'creates nothing with -WhatIf' {
        $root = Join-Path $TestDrive 'Media3'
        & $script:Script -Root $root -WhatIf | Out-Null
        Test-Path $root | Should -BeFalse
    }
    It 'rejects folder names with path characters' {
        { & $script:Script -Root (Join-Path $TestDrive 'M4') -Folders 'a\b' } | Should -Throw
    }
}

Describe 'Test-JellyfinServer.ps1 parameter validation' {
    BeforeAll { $script:Script = [System.IO.Path]::Combine($PSScriptRoot, '..', 'scripts', 'Test-JellyfinServer.ps1') }

    It 'rejects port 0' {
        { & $script:Script -Port 0 } | Should -Throw
    }
    It 'rejects port 70000' {
        { & $script:Script -Port 70000 } | Should -Throw
    }
    It 'rejects a server name with a URL scheme or slash' {
        { & $script:Script -Server 'http://x/y' } | Should -Throw
    }
}

Describe 'Get-TestMedia.ps1 parameter validation' {
    BeforeAll { $script:Script = [System.IO.Path]::Combine($PSScriptRoot, '..', 'scripts', 'Get-TestMedia.ps1') }

    It 'rejects a relative MediaRoot' {
        { & $script:Script -MediaRoot 'media' } | Should -Throw
    }
    It 'rejects ClipSeconds out of range' {
        { & $script:Script -MediaRoot $TestDrive -ClipSeconds 5 } | Should -Throw
        { & $script:Script -MediaRoot $TestDrive -ClipSeconds 9999 } | Should -Throw
    }
}

Describe 'Set-JellyfinFirewall.ps1 parameter validation' {
    It 'rejects invalid ports' {
        $s = [System.IO.Path]::Combine($PSScriptRoot, '..', 'scripts', 'Set-JellyfinFirewall.ps1')
        { & $s -HttpPort 0 } | Should -Throw
        { & $s -DiscoveryPort 99999 } | Should -Throw
    }
}
