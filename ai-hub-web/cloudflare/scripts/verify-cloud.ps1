[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$WorkerUrl,
  [Parameter(Mandatory = $true)][string]$AccessToken
)

$ErrorActionPreference = 'Stop'
$WorkerUrl = $WorkerUrl.TrimEnd('/')
$headers = @{ Authorization = "Bearer $AccessToken" }

Write-Host "1/4 Health 확인: $WorkerUrl/health"
$health = Invoke-RestMethod -Uri "$WorkerUrl/health" -Method Get
if (-not $health.ok) { throw 'Worker health 확인 실패' }

Write-Host '2/4 D1 데이터셋 API 확인'
$datasets = Invoke-RestMethod -Uri "$WorkerUrl/api/inventory/datasets" -Headers $headers -Method Get
Write-Host "  데이터셋 $(@($datasets).Count)개"

Write-Host '3/4 R2/산출물 메타데이터 API 확인'
$files = Invoke-RestMethod -Uri "$WorkerUrl/api/inventory/files" -Headers $headers -Method Get
Write-Host "  저장 파일 $(@($files).Count)개"

Write-Host '4/4 인증 차단 확인'
try {
  Invoke-WebRequest -Uri "$WorkerUrl/api/inventory/datasets" -Method Get -ErrorAction Stop | Out-Null
  throw '토큰 없는 요청이 허용되었습니다. API_TOKEN 설정을 확인하세요.'
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw }
}

Write-Host 'Cloudflare 연결 검증을 모두 통과했습니다.' -ForegroundColor Green
