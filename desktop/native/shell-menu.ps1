# Per-user classic Explorer integration. No administrator privileges required.
[CmdletBinding(SupportsShouldProcess=$true)]
param([string]$AppPath, [switch]$Uninstall, [switch]$Status)
$ErrorActionPreference = 'Stop'
$Roots = @('HKCU:\Software\Classes\*\shell\FurtherCompare', 'HKCU:\Software\Classes\Directory\shell\FurtherCompare')
$Owner = 'FurtherCompare.Shell.v1'
$Items = @(@('01Left','Set as Left','--fc-set-left', $true), @('02Compare','Compare with Left','--fc-compare-left', $true), @('03Clear','Clear Left Selection','--fc-clear-left', $false))
# LiteralPath is essential: the '*' is a registry key name, not a wildcard.
if ($Status) {
    $Installed = $true
    $OwnedCount = 0
    $Stale = $false
    $Target = $AppPath
    foreach ($Root in $Roots) {
        if (-not (Test-Path -LiteralPath $Root)) { $Installed = $false; continue }
        $Properties = Get-ItemProperty -LiteralPath $Root
        $Owned = $Properties.FCInstallerOwner -eq $Owner
        if (-not $Owned) { $Installed = $false; continue }
        $OwnedCount++
        if ($Properties.MUIVerb -cne 'Further Compare' -or $Properties.SubCommands -cne '') { $Installed = $false; $Stale = $true }
        foreach ($Item in $Items) {
            $ChildPath = $Root + '\shell\' + $Item[0]
            $CommandPath = $ChildPath + '\command'
            if (-not (Test-Path -LiteralPath $CommandPath)) { $Installed = $false; $Stale = $true; continue }
            $Child = Get-ItemProperty -LiteralPath $ChildPath
            if ($Child.MUIVerb -cne $Item[1] -or $Child.MultiSelectModel -cne 'Single') { $Installed = $false; $Stale = $true }
            $Actual = (Get-Item -LiteralPath $CommandPath).GetValue('')
            # Without an expected app, infer it once and require all commands to agree.
            if (-not $Target -and $Actual -match '^"([^"\r\n]+)" ') { $Target = $Matches[1] }
            $Expected = '"{0}" {1}' -f $Target, $Item[2]
            if ($Item[3]) { $Expected += ' "%1"' }
            if (-not $Target -or $Actual -cne $Expected) { $Installed = $false; $Stale = $true }
        }
        if ($Properties.Icon -cne ('"{0}",0' -f $Target)) { $Installed = $false; $Stale = $true }
    }
    if ($OwnedCount -gt 0) {
        # Stale generated commands do not constitute a usable installation.
        $TargetValid = $Target -and [IO.Path]::IsPathRooted($Target) -and [IO.Path]::GetFileName($Target) -ieq 'Further Compare.exe'
        if ($TargetValid) { $TargetValid = Test-Path -LiteralPath $Target -PathType Leaf }
        if (-not $TargetValid) { $Installed = $false; $Stale = $true }
    }
    @{ installed = [bool]$Installed; partial = [bool]($OwnedCount -gt 0 -and -not $Installed); stale = [bool]$Stale } | ConvertTo-Json -Compress
    return
}
# Preflight ALL destinations before installing, repairing, or removing either menu.
foreach ($Root in $Roots) {
    if (Test-Path -LiteralPath $Root) {
        $Existing = Get-ItemProperty -LiteralPath $Root
        if ($Existing.FCInstallerOwner -ne $Owner) { throw "Refusing to modify an unowned FurtherCompare registry key: $Root" }
    }
}
if ($Uninstall) {
    foreach ($Root in $Roots) {
        if ((Test-Path -LiteralPath $Root) -and $PSCmdlet.ShouldProcess($Root, 'Remove Further Compare context menu')) { Remove-Item -LiteralPath $Root -Recurse -Force }
    }
    return
}
if (-not $AppPath -or -not [IO.Path]::IsPathRooted($AppPath) -or $AppPath -match '["\r\n]' -or [IO.Path]::GetExtension($AppPath) -ne '.exe') { throw 'Supply an absolute installed Further Compare .exe path.' }
$AppFile = Get-Item -LiteralPath $AppPath
if ($AppFile.PSIsContainer -or $AppFile.Name -ne 'Further Compare.exe') { throw 'Select the installed Further Compare.exe executable.' }
$AppPath = $AppFile.FullName
foreach ($Root in $Roots) {
    if (-not $PSCmdlet.ShouldProcess($Root, 'Install Further Compare context menu for files and folders')) { continue }
    # Registry API avoids PowerShell provider wildcard interpretation during creation.
    $Key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($Root.Substring('HKCU:\'.Length))
    try {
        $Key.SetValue('FCInstallerOwner', $Owner)
        $Key.SetValue('MUIVerb', 'Further Compare')
        $Key.SetValue('Icon', ('"{0}",0' -f $AppPath))
        $Key.SetValue('SubCommands', '')
        foreach ($Item in $Items) {
            $Child = $Key.CreateSubKey(('shell\' + $Item[0]))
            try {
                $Child.SetValue('MUIVerb', $Item[1])
                $Child.SetValue('MultiSelectModel', 'Single')
                $Command = $Child.CreateSubKey('command')
                try {
                    $Text = '"{0}" {1}' -f $AppPath, $Item[2]
                    if ($Item[3]) { $Text += ' "%1"' }
                    $Command.SetValue('', $Text)
                } finally { $Command.Dispose() }
            } finally { $Child.Dispose() }
        }
    } finally { $Key.Dispose() }
}
Write-Output 'Further Compare classic Explorer menus installed for files and folders for the current user.'
