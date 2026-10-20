@{
    # CI fails on Error only; warnings are printed.
    Severity     = @('Error', 'Warning')

    # These are interactive console scripts: Write-Host output for the user is intentional.
    ExcludeRules = @('PSAvoidUsingWriteHost')
}
