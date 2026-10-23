# Thin development wrapper; packaged app uses desktop/native/shell-menu.ps1.
[CmdletBinding(SupportsShouldProcess=$true)]
param([string]$AppPath, [switch]$Uninstall, [switch]$Status)
& (Join-Path $PSScriptRoot '..\desktop\native\shell-menu.ps1') @PSBoundParameters
