param([Parameter(Mandatory=$true)][string]$Helper,[Parameter(Mandatory=$true)][string]$Sha256,[Parameter(Mandatory=$true)][string]$Publisher,[Parameter(Mandatory=$true)][string]$Request,[switch]$ReturnObject)
$ErrorActionPreference='Stop'
$utf8=New-Object Text.UTF8Encoding($false,$true)
[Console]::OutputEncoding=$utf8
$OutputEncoding=$utf8
$lock=$null;$process=$null;$started=$false
try {
 if($Helper -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFileName($Helper) -cne 'FurtherComparePackageInspection.exe' -or $Sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid helper binding'}
 $item=Get-Item -LiteralPath $Helper -Force
 if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -gt 16777216){throw 'Invalid helper file'}
 # Reject redirected ancestor directories as well as the final executable.
 $parent=$item.Directory
 while($null -ne $parent){if(($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Redirected helper directory'};$parent=$parent.Parent}
 $lock=[IO.File]::Open($Helper,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $algorithm=[Security.Cryptography.SHA256]::Create()
 try{$actual=([BitConverter]::ToString($algorithm.ComputeHash($lock))).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}
 if($actual -cne $Sha256){throw 'Helper digest mismatch'}
 $signature=Get-AuthenticodeSignature -LiteralPath $Helper
 if($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Subject -cne $Publisher){throw 'Helper signer mismatch'}
 if($Request.Length -gt 100000){throw 'Oversized request'}
 $argsValue=ConvertFrom-Json -InputObject $Request
 if($argsValue -isnot [Array] -or ($argsValue.Count -ne 4 -and $argsValue.Count -ne 2)){throw 'Invalid helper arguments'}
 foreach($value in $argsValue){if($value -isnot [string] -or $value.Length -gt 32768 -or $value -match '[\x00-\x1f"]' -or $value.EndsWith('\')){throw 'Invalid helper argument'}}
 if(!(($argsValue.Count -eq 4 -and $argsValue[0] -ceq 'package' -and [IO.Path]::GetDirectoryName($argsValue[1]) -ceq [IO.Path]::GetDirectoryName($Helper) -and [IO.Path]::GetFileName($argsValue[1]) -ceq 'Explorer.msix' -and $argsValue[3] -ceq $Publisher) -or ($argsValue.Count -eq 2 -and $argsValue[0] -ceq 'external-location' -and $argsValue[1] -notmatch '[\\/]'))){throw 'Unsupported helper request'}
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.StandardOutputEncoding=$utf8;$start.StandardErrorEncoding=$utf8
 $start.FileName=$Helper;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.Arguments=($argsValue | ForEach-Object {'"'+$_+'"'}) -join ' '
 $process=New-Object Diagnostics.Process;$process.StartInfo=$start
 if(!$process.Start()){throw 'Helper did not start'};$started=$true
 # Stream into bounded buffers; do not use unbounded ReadToEndAsync.
 $out=New-Object Text.StringBuilder;$err=New-Object Text.StringBuilder
 $watch=[Diagnostics.Stopwatch]::StartNew()
 $ob=New-Object char[] 2048;$eb=New-Object char[] 2048
 $ot=$process.StandardOutput.ReadAsync($ob,0,$ob.Length);$et=$process.StandardError.ReadAsync($eb,0,$eb.Length);$od=$false;$ed=$false
 while(!$od -or !$ed -or !$process.HasExited){
  if($watch.ElapsedMilliseconds -gt 30000){throw 'Helper timed out'}
  if(!$od -and $ot.IsCompleted){$n=$ot.GetAwaiter().GetResult();if($n -eq 0){$od=$true}else{[void]$out.Append($ob,0,$n);if($out.Length -gt 65536){throw 'Oversized helper output'};$ot=$process.StandardOutput.ReadAsync($ob,0,$ob.Length)}}
  if(!$ed -and $et.IsCompleted){$n=$et.GetAwaiter().GetResult();if($n -eq 0){$ed=$true}else{[void]$err.Append($eb,0,$n);if($err.Length -gt 8192){throw 'Oversized helper diagnostic'};$et=$process.StandardError.ReadAsync($eb,0,$eb.Length)}}
  Start-Sleep -Milliseconds 10
 }
 if($process.ExitCode -ne 0){throw 'Helper refused attestation'}
 $result=ConvertFrom-Json -InputObject $out.ToString()
 $envelope=@{version=1;kind='helper-invocation';helper=@{path=$lock.Name;sha256=$actual;publisher=$signature.SignerCertificate.Subject;signatureValid=$true;lockScope='invocation'};result=$result}
 if($ReturnObject){return $envelope}
 [Console]::Out.Write(($envelope | ConvertTo-Json -Depth 16 -Compress))
} catch { if($ReturnObject){throw};[Console]::Error.WriteLine('Explorer attestation failed: '+$_.Exception.Message);exit 1 }
finally {if($null -ne $process){if($started -and !$process.HasExited){$process.Kill();$process.WaitForExit(5000)|Out-Null};$process.Dispose()};if($null -ne $lock){$lock.Dispose()}}
