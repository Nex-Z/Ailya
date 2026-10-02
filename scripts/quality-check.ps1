[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('static','browser')][string]$Lane,
 [string[]]$TestFiles=@(),
 [switch]$AllBrowser
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
 if($Lane -eq 'browser' -and ($AllBrowser.IsPresent -eq ($TestFiles.Count -gt 0))){throw 'Choose TestFiles or AllBrowser, exactly one.'}
 if($Lane -eq 'static' -and ($AllBrowser -or $TestFiles.Count)){throw 'Browser options cannot be used for static checks.'}
 foreach($file in $TestFiles){
  if($file -notmatch '^tests/[a-zA-Z0-9_-]+\.spec\.ts$' -or -not(Test-Path -LiteralPath $file)){throw "Unknown test path: $file"}
 }
 function Get-SourceFingerprint {
  $paths=@(& git -c core.quotepath=false ls-files --cached --others --exclude-standard)
  if($LASTEXITCODE -ne 0){throw 'Cannot enumerate source files.'}
  $rows=@($paths | Sort-Object -Unique | ForEach-Object {
   if(Test-Path -LiteralPath $_ -PathType Leaf){[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash}}
   else{[ordered]@{path=$_;sha256='missing'}}
  })
  return ,$rows
 }
 $before=Get-SourceFingerprint
 $head=(& git rev-parse HEAD).Trim()
 if($LASTEXITCODE -ne 0){throw 'Cannot resolve HEAD.'}
 $runId=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
 $out=Join-Path $root "artifacts/quality/$runId"
 New-Item -ItemType Directory -Path $out | Out-Null
 $results=@()
 $commands=if($Lane -eq 'static'){@(@{exe='npm.cmd';arguments=@('run','lint')},@{exe='npm.cmd';arguments=@('run','build')})}else{@(@{exe='npx.cmd';arguments=@('--no-install','playwright','test')+$TestFiles})}
 $failed=$false
 foreach($command in $commands){
  $log=Join-Path $out ("check-"+$results.Count+'.log')
  $started=(Get-Date).ToUniversalTime().ToString('o')
  $code=1
  try {
   # Windows PowerShell maps native stderr to error records; exit code owns failure.
   $ErrorActionPreference='Continue'
   & $command.exe @($command.arguments) *> $log
   $code=$LASTEXITCODE
  } catch { $_.Exception.Message | Add-Content $log } finally { $ErrorActionPreference='Stop' }
  $results+=@{command=$command.exe;arguments=$command.arguments;startedAt=$started;exitCode=$code;log=$log}
  if($code -ne 0){$failed=$true;break}
 }
 $after=Get-SourceFingerprint
 $changed=($before | ConvertTo-Json -Depth 4 -Compress) -cne ($after | ConvertTo-Json -Depth 4 -Compress)
 if($changed){$failed=$true}
 [ordered]@{schemaVersion=1;head=$head;platform=[Environment]::OSVersion.ToString();lane=$Lane;commands=$results;sourceBefore=$before;sourceAfter=$after;sourceChanged=$changed;status=$(if($failed){'failed'}else{'commands-passed'});humanReview='pending';note='Exit codes do not establish semantic correctness or absence of skipped tests.'} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'report.json') -Encoding UTF8
 Write-Output "Evidence: $out"
 if($failed){exit 1}
} finally { Pop-Location }

