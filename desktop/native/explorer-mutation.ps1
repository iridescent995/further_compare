param([Parameter(Mandatory=$true)][string]$RequestBase64)
$ErrorActionPreference='Stop'
$utf8=New-Object Text.UTF8Encoding($false,$true)
[Console]::OutputEncoding=$utf8
if($RequestBase64.Length -gt 174764){throw 'Oversized mutation request.'}
$bytes=[Convert]::FromBase64String($RequestBase64)
if($bytes.Length -gt 131072){throw 'Oversized mutation request.'}
$r=$utf8.GetString($bytes)|ConvertFrom-Json
if($r.version -ne 1 -or $r.operationId -notmatch '^[a-fA-F0-9-]{36}$'){throw 'Invalid mutation request.'}
$s=$r.step;$e=$r.expected;$id=$e.identity
$subkey='Software\FurtherCompare\Explorer'
$locks=New-Object System.Collections.Generic.List[object]
$key=$null
$registry=$null
if(-not [Environment]::Is64BitProcess){throw 'Native 64-bit registry view required.'}
$registry=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::Registry64)
function Local-Path([string]$p){if($p -notmatch '^[A-Za-z]:\\' -or $p -match '[\x00-\x1f"<>|?*/]' -or $p.Substring(2).Contains(':') -or [IO.Path]::GetFullPath($p) -cne $p){throw 'Unsafe installation path.'}}
function Equal-Value($actual,$expected){return ($actual|ConvertTo-Json -Compress -Depth 12) -ceq ($expected|ConvertTo-Json -Compress -Depth 12)}
function Check-Config {
 $current=$registry.OpenSubKey($subkey,$false)
 try{
  if(($null -ne $current) -ne [bool]$r.observed.config.exists){throw 'Configuration presence changed.'}
  if($null -ne $current){
   $names=@($current.GetValueNames());$props=@($r.observed.config.values.PSObject.Properties)
   if($names.Count -ne $props.Count){throw 'Configuration changed.'}
   foreach($prop in $props){
    if(-not ($names -ccontains $prop.Name)){throw 'Configuration name changed.'}
    $kind=[string]$current.GetValueKind($prop.Name);$v=$current.GetValue($prop.Name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $type=switch($kind){'DWord'{'DWORD'}'String'{'REG_SZ'}'ExpandString'{'REG_EXPAND_SZ'}'MultiString'{'REG_MULTI_SZ'}'Binary'{'REG_BINARY';$v=[Convert]::ToBase64String($v)}'QWord'{'REG_QWORD';$v=[string]$v}default{throw 'Unsupported registry type.'}}
    if($type -cne $prop.Value.type -or -not (Equal-Value $v $prop.Value.value)){throw 'Configuration value changed.'}
   }
  }
 }finally{if($current){$current.Dispose()}}
}
function Check-Packages {
 $all=@(Get-AppxPackage -PackageTypeFilter Main -ErrorAction Stop)
 if($all.Count -gt 2048){throw 'Package inventory exceeds bound.'}
 $matches=@($all|Where-Object {$_.Name -ceq $id.name})
 $before=@($r.observed.packages)
 if($matches.Count -ne $before.Count){throw 'Package inventory changed.'}
 foreach($p in $matches){$old=@($before|Where-Object {$_.fullName -ceq $p.PackageFullName});if($old.Count -ne 1 -or $old[0].familyName -cne $p.PackageFamilyName -or $old[0].publisher -cne $p.Publisher -or $old[0].status -cne [string]$p.Status){throw 'Package identity changed.'}}
 return $matches
}
function Trusted-Script($binding){
 $data=[Convert]::FromBase64String($binding.source)
 if($data.Length -lt 1 -or $data.Length -gt 65536){throw 'Invalid embedded guard.'}
 $hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($data))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
 if($actual -cne $binding.sha256){throw 'Embedded guard identity mismatch.'}
 return [scriptblock]::Create($utf8.GetString($data))
}
function Check-NativeGuard {
 $g=$r.nativeGuard;$directory=[IO.Path]::GetDirectoryName($e.executable)
 if($g.helper -cne (Join-Path $directory 'FurtherComparePackageInspection.exe') -or $g.helperSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Missing trusted helper binding.'}
 $inspection=Trusted-Script $g.inspection
 $fresh=(& $inspection -InstallDirectory $directory -PackageName $id.name -Publisher $id.publisher)|ConvertFrom-Json
 if($fresh.supported -ne $true -or $fresh.inspectionOnly -ne $true -or $fresh.verified -ne $false -or @($fresh.observed.conflicts).Count -ne 0){throw 'Fresh native inventory is conflicting or unavailable.'}
 $before=@($r.observed.packages);$after=@($fresh.observed.packages)
 if($before.Count -ne $after.Count){throw 'Fresh native inventory changed.'}
 $attestation=Trusted-Script $g.attestation
 foreach($p in $after){
  $old=@($before|Where-Object {$_.fullName -ceq $p.fullName})
  if($old.Count -ne 1 -or $p.publisher -cne $old[0].publisher -or $p.familyName -cne $old[0].familyName -or $p.architecture -cne $old[0].architecture -or $p.status -cne $old[0].status -or $old[0].verified -ne $true){throw 'Native package identity changed.'}
  $argsJson=ConvertTo-Json -InputObject @('external-location',$p.fullName) -Compress
  $proof=(& $attestation -Helper $g.helper -Sha256 $g.helperSha256 -Publisher $id.publisher -Request $argsJson -ReturnObject)
  $location=$proof.result
  if($proof.kind -cne 'helper-invocation' -or $proof.helper.sha256 -cne $g.helperSha256 -or $proof.helper.signatureValid -ne $true -or $proof.helper.publisher -cne $id.publisher -or $location.kind -cne 'registered-location' -or $location.locationVerified -ne $true -or $location.packageIdentityVerified -ne $false -or $location.fullName -cne $p.fullName -or $location.externalLocation -cne $old[0].externalLocation){throw 'Native registered location changed.'}
  if($s.kind -ceq 'remove-package' -and $location.externalLocation -cne $s.externalLocation){throw 'Removal location changed.'}
 }
 # Recheck registry after potentially slow manifest/helper work.
 Check-Config
}
function Lock-Asset([string]$kind,[long]$limit){
 $a=$e.assets.$kind;Local-Path $a.path
 $ancestor=$a.path;while($ancestor){$item=Get-Item -LiteralPath $ancestor -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected deployment asset.'};$ancestor=[IO.Path]::GetDirectoryName($ancestor)}
 $stream=[IO.File]::Open($a.path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$locks.Add($stream)
 if($stream.Length -gt $limit){throw 'Oversized deployment asset.'}
 $hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
 $signature=Get-AuthenticodeSignature -LiteralPath $a.path
 if($actual -cne $a.sha256 -or [string]$signature.Status -cne 'Valid' -or $signature.SignerCertificate.Subject -cne $id.publisher){throw 'Deployment asset changed.'}
}
try{
 if($id.verified -ne $true -or @($r.observed.conflicts).Count -ne 0){throw 'Unverified deployment.'}
 Local-Path $e.executable;Local-Path $e.dll;Local-Path $e.packagePath
 Check-Config
 $packages=@(Check-Packages)
 switch($s.kind){
  'write-owned-config-values'{
   $wanted=@('OwnerVersion','Executable','PackageFamilyName','PackageFullName')
   if(@($s.values.PSObject.Properties).Count -ne 4 -or $s.values.OwnerVersion.type -cne 'DWORD' -or $s.values.OwnerVersion.value -ne 1 -or $s.values.Executable.value -cne $e.executable -or $s.values.PackageFamilyName.value -cne $id.familyName -or $s.values.PackageFullName.value -cne $id.fullName){throw 'Invalid ownership values.'}
   foreach($name in $wanted|Where-Object {$_ -ne 'OwnerVersion'}){if($s.values.$name.type -cne 'REG_SZ'){throw 'Invalid ownership type.'}}
   if(-not $r.observed.config.exists -and -not $s.requireAbsent){throw 'Missing absence guard.'}
   if($r.observed.config.exists -and ($r.observed.config.values.OwnerVersion.value -ne 1 -or $null -eq $s.requireOwnedConfig)){throw 'Missing ownership guard.'}
   Check-NativeGuard
   $key=$registry.CreateSubKey($subkey)
   foreach($name in $wanted){$kind=if($name -eq 'OwnerVersion'){[Microsoft.Win32.RegistryValueKind]::DWord}else{[Microsoft.Win32.RegistryValueKind]::String};$key.SetValue($name,$s.values.$name.value,$kind)}
   if($s.clearHint){$key.DeleteValue('LeftHint',$false)}
   $key.Flush()
  }
  'remove-owned-config-values'{
   if(-not $r.observed.config.exists -or $r.observed.config.values.OwnerVersion.value -ne 1 -or $null -eq $s.requireOwnedConfig){throw 'Missing removal ownership.'}
   if(($s.names -join ',') -cne 'LeftHint,PackageFullName,PackageFamilyName,Executable,OwnerVersion'){throw 'Invalid removal values.'}
   Check-NativeGuard;$key=$registry.OpenSubKey($subkey,$true)
   foreach($name in $s.names){$key.DeleteValue($name,$false)};$key.Flush()
  }
  'register-sparse-package'{
   if($s.packagePath -cne $e.packagePath -or $s.externalLocation -cne [IO.Path]::GetDirectoryName($e.executable) -or $s.sha256 -cne $e.assets.package.sha256 -or $packages.Count -ne 0){throw 'Registration binding changed.'}
   Lock-Asset 'executable' 536870912;Lock-Asset 'dll' 67108864;Lock-Asset 'package' 16777216
   Check-NativeGuard;$null=Check-Packages
   Add-AppxPackage -Path $s.packagePath -ExternalLocation $s.externalLocation -ErrorAction Stop | Out-Null
  }
  'remove-package'{
   if($packages.Count -ne 1 -or $packages[0].PackageFullName -cne $s.fullName -or $packages[0].PackageFamilyName -cne $s.familyName -or $packages[0].Publisher -cne $id.publisher -or $r.observed.config.values.OwnerVersion.value -ne 1 -or $r.observed.config.values.PackageFullName.value -cne $s.fullName -or $null -eq $s.requireOwnedConfig){throw 'Removal binding changed.'}
   Check-NativeGuard;$null=Check-Packages
   Remove-AppxPackage -Package $s.fullName -ErrorAction Stop | Out-Null
  }
  default{throw 'Unsupported lifecycle mutation.'}
 }
 @{version=1;ok=$true;operationId=$r.operationId;kind=$s.kind}|ConvertTo-Json -Compress
}finally{if($key){$key.Dispose()};if($registry){$registry.Dispose()};foreach($stream in $locks){$stream.Dispose()}}
