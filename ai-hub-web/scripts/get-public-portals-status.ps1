$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$statusPath = Join-Path $webDir '.runtime\public-portals-status.json'
if (-not (Test-Path -LiteralPath $statusPath)) {
  Write-Output '상태 파일이 없습니다. 자동 복구 감시기가 아직 시작되지 않았습니다.'
  exit 2
}
$status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
$checkedAt = [DateTime]::Parse($status.checkedAt).ToUniversalTime()
$age = [int]([DateTime]::UtcNow - $checkedAt).TotalSeconds
$watchdogState = if ($age -gt 90) { 'stale (감시기 응답 없음)' } else { $status.state }
$liveGateway = $false
$liveBackend = $false
try { $liveGateway = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3002/admin/' -TimeoutSec 3).StatusCode -eq 200 } catch {}
try { $liveBackend = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3003/health' -TimeoutSec 3).StatusCode -eq 200 } catch {}
$liveTunnel = $false
$liveTunnelPidPath = Join-Path $webDir '.runtime\portals-tunnel.pid'
if (Test-Path -LiteralPath $liveTunnelPidPath) {
  $liveTunnelProcess = Get-Process -Id ([int](Get-Content -Raw $liveTunnelPidPath)) -ErrorAction SilentlyContinue
  if ($liveTunnelProcess) {
    $tunnelModePath = Join-Path $webDir '.runtime\portals-tunnel.mode'
    $tunnelMode = if (Test-Path -LiteralPath $tunnelModePath) { (Get-Content -Raw $tunnelModePath).Trim() } else { '' }
    $expectedName = if ($tunnelMode -eq 'ngrok') { 'ngrok' } else { 'cloudflared' }
    $liveTunnel = $liveTunnelProcess.ProcessName -eq $expectedName
  }
}
$publicUrl = if ($status.publicUrl) { $status.publicUrl } elseif (Test-Path -LiteralPath (Join-Path $webDir '.runtime\public-portals-url.txt')) { (Get-Content -Raw (Join-Path $webDir '.runtime\public-portals-url.txt')).Trim() } else { $null }
$livePublicPortal = $false
if ($publicUrl) { try { $livePublicPortal = (Invoke-WebRequest -UseBasicParsing -Uri "$($publicUrl.TrimEnd('/'))/admin/" -TimeoutSec 5).StatusCode -eq 200 } catch {} }
[pscustomobject]@{
  Overall = $watchdogState
  LiveGateway3002 = if ($liveGateway) { 'healthy' } else { 'unhealthy' }
  LiveSubmissionBackend3003 = if ($liveBackend) { 'healthy' } else { 'unhealthy' }
  LiveTunnel = if ($liveTunnel) { 'running' } else { 'stopped' }
  LivePublicPortal = if ($livePublicPortal) { 'reachable' } else { 'unreachable' }
  LastCheckUtc = $checkedAt.ToString('yyyy-MM-dd HH:mm:ss')
  SecondsSinceCheck = $age
  Gateway3002 = $status.gateway
  SubmissionBackend3003 = $status.submissionBackend
  Tunnel = $status.tunnel
  PublicUrl = $status.publicUrl
  LastRecoveryUtc = $status.lastRecoveryAt
  LastError = $status.lastError
} | Format-List
if ($age -gt 90 -or $status.state -ne 'healthy') { exit 1 }
