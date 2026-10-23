param([Parameter(Mandatory=$true)][string]$AppPath,[Parameter(Mandatory=$true)][string]$HintBase64)
$ErrorActionPreference = 'Stop'
# Fixed current-user metadata transport. No keys, registration, or host config are created.
if ($AppPath -notmatch '^[A-Za-z]:\\' -or $AppPath -match '[\x00-\x1f"/]' -or [IO.Path]::GetFileName($AppPath) -cne 'Further Compare.exe' -or [IO.Path]::GetFullPath($AppPath) -cne $AppPath) { throw 'Invalid executable path.' }
if ($HintBase64.Length -gt 272 -or $HintBase64 -notmatch '^[A-Za-z0-9+/]+={0,2}$') { throw 'Invalid hint encoding.' }
[byte[]]$bytes = [Convert]::FromBase64String($HintBase64)
if ($bytes.Length -lt 10 -or $bytes.Length -gt 202 -or ($bytes.Length % 2) -ne 0 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -cne 'FCLH' -or [BitConverter]::ToUInt16($bytes,4) -ne 1 -or $bytes[6] -gt 2 -or $bytes[7] -gt 1 -or (10 + 2 * [BitConverter]::ToUInt16($bytes,8)) -ne $bytes.Length -or ($bytes[6] -eq 0 -and ($bytes[7] -ne 0 -or $bytes.Length -ne 10))) { throw 'Invalid hint payload.' }
$key = $null
try {
 $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\FurtherCompare\Explorer',$true)
 $owned = $false
 if ($null -ne $key) {
  $names = $key.GetValueNames()
  if ($names -contains 'OwnerVersion' -and $names -contains 'Executable') {
   $owned = $key.GetValueKind('OwnerVersion') -eq [Microsoft.Win32.RegistryValueKind]::DWord -and $key.GetValue('OwnerVersion') -eq 1 -and $key.GetValueKind('Executable') -eq [Microsoft.Win32.RegistryValueKind]::String -and [String]::Equals([string]$key.GetValue('Executable'),$AppPath,[StringComparison]::Ordinal)
  }
 }
 if (-not $owned) { @{written=$false;skipped=$true;reason='unowned-config'} | ConvertTo-Json -Compress; exit 0 }
 $key.SetValue('LeftHint',$bytes,[Microsoft.Win32.RegistryValueKind]::Binary)
 $observed = $key.GetValue('LeftHint')
 if ($key.GetValueKind('LeftHint') -ne [Microsoft.Win32.RegistryValueKind]::Binary -or [Convert]::ToBase64String($observed) -cne $HintBase64) { throw 'Hint publication verification failed.' }
 @{written=$true;skipped=$false;reason='published'} | ConvertTo-Json -Compress
} finally { if ($null -ne $key) { $key.Dispose() } }
