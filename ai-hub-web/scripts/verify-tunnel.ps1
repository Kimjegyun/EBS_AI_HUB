[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$PublicHostname)

$ErrorActionPreference = 'Stop'
$PublicHostname = $PublicHostname.Trim().Replace('https://', '').TrimEnd('/')
Write-Host '1/3 로컬 Express 확인'
$local = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5
if ($local.status -ne 'ok') { throw '로컬 서버 상태가 정상이 아닙니다.' }

Write-Host '2/3 외부 Tunnel 확인'
$remote = Invoke-RestMethod -Uri "https://$PublicHostname/health" -TimeoutSec 15
if ($remote.status -ne 'ok') { throw '외부 Tunnel 상태가 정상이 아닙니다.' }

Write-Host '3/3 HTTPS 인증서 확인'
$request = [Net.HttpWebRequest]::Create("https://$PublicHostname/health")
$request.GetResponse().Dispose()
Write-Host '로컬 서버, 외부 Tunnel, HTTPS 인증서를 모두 확인했습니다.' -ForegroundColor Green
