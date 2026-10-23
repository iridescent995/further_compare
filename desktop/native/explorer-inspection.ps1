param([Parameter(Mandatory=$true)][string]$InstallDirectory,[Parameter(Mandatory=$true)][string]$PackageName,[Parameter(Mandatory=$true)][string]$Publisher)
$ErrorActionPreference='Stop'
if ($InstallDirectory -notmatch '^[A-Za-z]:\\' -or $InstallDirectory -match '[\x00-\x1f"<>|?*/]' -or [IO.Path]::GetFullPath($InstallDirectory) -cne $InstallDirectory -or $InstallDirectory.Length -gt 30000) { throw 'Invalid installation directory.' }
if ($PackageName -notmatch '^[A-Za-z0-9.-]{3,50}$' -or $Publisher.Length -lt 1 -or $Publisher.Length -gt 512 -or $Publisher -match '[\x00-\x1f]') { throw 'Invalid trusted identity configuration.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class FCExplorerRegistryRead {
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]
 static extern int RegEnumValueW(IntPtr key,uint index,StringBuilder name,ref uint nameLength,IntPtr reserved,out uint kind,byte[] data,ref uint length);
 public static Dictionary<string,object> Read(IntPtr key) {
  var result=new Dictionary<string,object>(StringComparer.OrdinalIgnoreCase);int total=0;
  for(uint index=0;index<=128;index++) {
   var name=new StringBuilder(129);uint names=129,size=8192,kind;var bytes=new byte[8192];
   int error=RegEnumValueW(key,index,name,ref names,IntPtr.Zero,out kind,bytes,ref size);
   if(error==259)return result;
   if(error!=0||index==128||names>128||size>8192||((total+=(int)size)>65536))throw new InvalidOperationException("Registry inspection bounds exceeded.");
   object value;string type;
   if(kind==4&&size==4){type="DWORD";value=BitConverter.ToUInt32(bytes,0);}
   else if(kind==11&&size==8){type="REG_QWORD";value=BitConverter.ToUInt64(bytes,0).ToString(System.Globalization.CultureInfo.InvariantCulture);}
   else if(kind==3){type="REG_BINARY";value=Convert.ToBase64String(bytes,0,(int)size);}
   else if((kind==1||kind==2||kind==7)&&size>=2&&size%2==0){
    var decoded=new UnicodeEncoding(false,false,true).GetString(bytes,0,(int)size);
    if(!decoded.EndsWith("\0",StringComparison.Ordinal))throw new InvalidOperationException("Unterminated registry text.");
    if(kind==7){type="REG_MULTI_SZ";value=decoded.TrimEnd('\0').Split('\0');}
    else {type=kind==1?"REG_SZ":"REG_EXPAND_SZ";value=decoded.Substring(0,decoded.Length-1);if(((string)value).IndexOf('\0')>=0)throw new InvalidOperationException("Embedded registry NUL.");}
   } else throw new InvalidOperationException("Unsupported registry value.");
   if(result.ContainsKey(name.ToString()))throw new InvalidOperationException("Registry changed during inspection.");
   result.Add(name.ToString(),new Dictionary<string,object>{{"type",type},{"value",value}});
  }
  throw new InvalidOperationException("Registry inspection bounds exceeded.");
 }
}
'@
$issues=New-Object System.Collections.Generic.List[string]
$conflicts=New-Object System.Collections.Generic.List[object]
$locks=New-Object System.Collections.Generic.List[object]
function Read-Asset([string]$name,[long]$limit) {
 $file=Join-Path $InstallDirectory $name
 $result=@{path=$file;exists=$false;signatureValid=$false;publisher=$null;sha256=$null}
 try {
  if (-not [IO.File]::Exists($file)) { $issues.Add("missing-$name"); return $result }
  $item=Get-Item -LiteralPath $file -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -gt $limit) { throw 'Unsafe or oversized installation asset.' }
  $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  $locks.Add($stream)
  if ($stream.Length -gt $limit) { throw 'Asset changed size.' }
  $result.exists=$true
  $hash=[Security.Cryptography.SHA256]::Create()
  try { $result.sha256=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
  $stream.Position=0
  $sig=Get-AuthenticodeSignature -LiteralPath $file
  $result.signatureStatus=[string]$sig.Status
  if ($null -ne $sig.SignerCertificate) { $result.publisher=$sig.SignerCertificate.Subject }
  $result.signatureValid=([string]$sig.Status -ceq 'Valid' -and [String]::Equals($result.publisher,$Publisher,[StringComparison]::Ordinal))
  if (-not $result.signatureValid) { $issues.Add("unverified-signature-$name") }
 } catch { $issues.Add("unavailable-$name"); $result.signatureValid=$false }
 return $result
}
function Read-Config {
 $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\FurtherCompare\Explorer',$false)
 if ($null -eq $key) { return @{exists=$false} }
 try {
  $values=[FCExplorerRegistryRead]::Read($key.Handle);return @{exists=$true;values=$values}
 } finally {$key.Dispose()}
}
try {
 # Reject junctions/symlinks in the supplied installation ancestry; do not resolve
 # an unexpected redirected install into trusted deployment evidence.
 $ancestor=$InstallDirectory
 while($ancestor){$entry=Get-Item -LiteralPath $ancestor -Force -ErrorAction SilentlyContinue;if($entry -and ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected installation directory.'};$parent=[IO.Path]::GetDirectoryName($ancestor);if($parent -eq $ancestor){break};$ancestor=$parent}
 $assets=@{executable=(Read-Asset 'Further Compare.exe' 536870912);dll=(Read-Asset 'FurtherCompareExplorer.dll' 67108864);package=(Read-Asset 'Explorer.msix' 16777216)}
 $candidate=$null
 if($assets.package.exists){try{
  $stream=$locks | Where-Object {$_.Name -ceq $assets.package.path} | Select-Object -First 1
  if($null -eq $stream){throw 'Missing locked package.'}
  $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read,$true)
  try{if($zip.Entries.Count -gt 512){throw 'Oversized sparse package.'};$entries=@($zip.Entries | Where-Object {$_.FullName -ceq 'AppxManifest.xml'});if($entries.Count -ne 1 -or $entries[0].Length -gt 262144){throw 'Invalid package manifest.'}
   $settings=[Xml.XmlReaderSettings]::new();$settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null;$settings.MaxCharactersInDocument=262144
   $manifestStream=$entries[0].Open();$reader=[Xml.XmlReader]::Create($manifestStream,$settings)
   try{$doc=[Xml.XmlDocument]::new();$doc.XmlResolver=$null;$doc.Load($reader)}finally{$reader.Dispose();$manifestStream.Dispose()}
   if($doc.DocumentElement.NamespaceURI -cne 'http://schemas.microsoft.com/appx/manifest/foundation/windows10'){throw 'Invalid manifest namespace.'}
   $nodes=@($doc.DocumentElement.ChildNodes | Where-Object {$_.LocalName -ceq 'Identity' -and $_.NamespaceURI -ceq $doc.DocumentElement.NamespaceURI});if($nodes.Count -ne 1){throw 'Invalid manifest identity.'};$node=$nodes[0]
   $candidate=@{name=$node.GetAttribute('Name');publisher=$node.GetAttribute('Publisher');version=$node.GetAttribute('Version');architecture=$node.GetAttribute('ProcessorArchitecture');verified=$false}
   if($candidate.name -cne $PackageName -or $candidate.publisher -cne $Publisher){$issues.Add('package-candidate-identity-mismatch')}
  }finally{$zip.Dispose()}
 }catch{$issues.Add('package-candidate-unreadable')}}
 $config=Read-Config
 $packages=New-Object System.Collections.Generic.List[object]
 $all=@(Get-AppxPackage -PackageTypeFilter Main -ErrorAction Stop)
 if($all.Count -gt 2048){throw 'Package inventory exceeds inspection bound.'}
 $clsid='B93D608A-F29E-4B13-A268-0B0729A4DED8'
 foreach($package in $all){
  try{$manifest=Get-AppxPackageManifest -Package $package.PackageFullName -ErrorAction Stop
   $usesClass=@($manifest.GetElementsByTagName('Class','http://schemas.microsoft.com/appx/manifest/com/windows10') | Where-Object {$_.GetAttribute('Id').Trim('{}') -ieq $clsid}).Count -gt 0
   if($usesClass -and ($package.Name -cne $PackageName -or $package.Publisher -cne $Publisher)){$conflicts.Add(@{kind='foreign-package-clsid';fullName=[string]$package.PackageFullName})}
   if($package.Name -ceq $PackageName){$packages.Add(@{name=[string]$package.Name;publisher=[string]$package.Publisher;familyName=[string]$package.PackageFamilyName;fullName=[string]$package.PackageFullName;architecture=([string]$package.Architecture).ToLowerInvariant();signatureKind=[string]$package.SignatureKind;status=[string]$package.Status;installedLocation=[string]$package.InstallLocation;externalLocation=$null;verified=$false});if($package.Publisher -cne $Publisher){$conflicts.Add(@{kind='package-name-publisher-conflict';fullName=[string]$package.PackageFullName})}}
  }catch{$issues.Add('registered-package-manifest-unavailable');$conflicts.Add(@{kind='incomplete-package-inventory'})}
 }
 foreach($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)){foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){$base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,$view);try{$key=$base.OpenSubKey("Software\Classes\CLSID\{$clsid}",$false);if($null -ne $key){try{$conflicts.Add(@{kind='direct-clsid-registration';hive=[string]$hive;view=[string]$view})}finally{$key.Dispose()}}}finally{$base.Dispose()}}}
 $issues.Add('offline-package-schema-blockmap-and-identity-verifier-required')
 $issues.Add('registered-external-location-verifier-required')
 $arch=$env:PROCESSOR_ARCHITEW6432;if(-not $arch){$arch=$env:PROCESSOR_ARCHITECTURE};$arch=switch($arch){'AMD64'{'x64'} 'ARM64'{'arm64'} default {'unknown'}}
 @{version=1;supported=$true;inspectionOnly=$true;verified=$false;trustedIdentity=@{name=$PackageName;publisher=$Publisher};installation=@{executable=$assets.executable.path;dll=$assets.dll.path;packagePath=$assets.package.path};assets=$assets;identityCandidate=$candidate;observed=@{platform='win32';build=[Environment]::OSVersion.Version.Build;architecture=$arch;config=$config;packages=@($packages.ToArray());conflicts=@($conflicts.ToArray())};limitations=@($issues.ToArray())} | ConvertTo-Json -Depth 12 -Compress
} finally {foreach($stream in $locks){$stream.Dispose()}}
