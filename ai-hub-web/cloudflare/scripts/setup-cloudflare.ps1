[CmdletBinding()]
param(
  [string]$VercelOrigin,
  [string]$DatabaseId,
  [string]$DatabaseName = 'ebs-inventory',
  [string]$BucketName = 'ebs-inventory-files',
  [switch]$SkipLogin,
  [switch]$SkipVercel
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$webDir = Split-Path -Parent $projectDir
$configPath = Join-Path $projectDir 'wrangler.toml'
$localEnvPath = Join-Path $webDir '.env.local'
$env:XDG_CONFIG_HOME = Join-Path $projectDir '.config'

function Invoke-Wrangler([string[]]$Arguments, [switch]$AllowFailure) {
  Write-Host "`n> npx wrangler $($Arguments -join ' ')" -ForegroundColor Cyan
  $output = & npx.cmd wrangler @Arguments 2>&1
  $code = $LASTEXITCODE
  $output | ForEach-Object { Write-Host $_ }
  if ($code -ne 0 -and -not $AllowFailure) { throw "Wrangler 명령이 실패했습니다. (exit $code)" }
  return ($output -join "`n")
}

function Set-ConfigValue([string]$Pattern, [string]$Replacement) {
  $content = Get-Content -LiteralPath $configPath -Raw
  $updated = [regex]::Replace($content, $Pattern, $Replacement)
  if ($content -eq $updated) { throw "wrangler.toml에서 변경 대상을 찾지 못했습니다: $Pattern" }
  Set-Content -LiteralPath $configPath -Value $updated -Encoding utf8
}

function New-AccessToken {
  $bytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Set-LocalEnvironment([string[]]$Lines) {
  $existing = if (Test-Path -LiteralPath $localEnvPath) {
    [Collections.Generic.List[string]](Get-Content -LiteralPath $localEnvPath)
  } else {
    [Collections.Generic.List[string]]::new()
  }
  foreach ($line in $Lines) {
    $name = $line.Split('=', 2)[0]
    $found = $false
    for ($i = 0; $i -lt $existing.Count; $i++) {
      if ($existing[$i] -match "^$([regex]::Escape($name))=") {
        $existing[$i] = $line
        $found = $true
        break
      }
    }
    if (-not $found) { $existing.Add($line) }
  }
  Set-Content -LiteralPath $localEnvPath -Value $existing -Encoding utf8
}

function Set-WorkerSecret([string]$Name, [string]$Value) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = 'npx.cmd'
  $start.ArgumentList.Add('wrangler')
  $start.ArgumentList.Add('secret')
  $start.ArgumentList.Add('put')
  $start.ArgumentList.Add($Name)
  $start.WorkingDirectory = $projectDir
  $start.UseShellExecute = $false
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($start)
  $process.StandardInput.WriteLine($Value)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  Write-Host $stdout
  if ($process.ExitCode -ne 0) { throw "Secret 등록 실패: $stderr" }
}

Set-Location -LiteralPath $projectDir
Write-Host 'EBS 재물조사 Cloudflare 초기 설정' -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js가 설치되어 있지 않습니다.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules'))) {
  Write-Host 'Cloudflare 의존성을 설치합니다.'
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw 'npm install 실패' }
}

if (-not $SkipLogin) {
  & npx.cmd wrangler whoami *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '브라우저에서 Cloudflare 로그인을 완료해 주세요.' -ForegroundColor Yellow
    Invoke-Wrangler @('login') | Out-Null
  }
}

if (-not $VercelOrigin) {
  $VercelOrigin = Read-Host 'Vercel 공개 주소를 입력하세요 (예: https://ebs-ai-hub.vercel.app)'
}
$VercelOrigin = $VercelOrigin.Trim().TrimEnd('/')
if ($VercelOrigin -notmatch '^https://[^/]+$') { throw 'Vercel 주소는 https://도메인 형식이어야 합니다.' }
Set-ConfigValue 'ALLOWED_ORIGINS\s*=\s*"[^"]*"' "ALLOWED_ORIGINS = `"$VercelOrigin`""

$config = Get-Content -LiteralPath $configPath -Raw
if (-not $DatabaseId -and $config -match 'database_id\s*=\s*"([0-9a-f-]{36})"') { $DatabaseId = $Matches[1] }
if (-not $DatabaseId) {
  $createOutput = Invoke-Wrangler @('d1', 'create', $DatabaseName, '--location', 'apac') -AllowFailure
  if ($createOutput -match 'database_id\s*=\s*"([0-9a-f-]{36})"') { $DatabaseId = $Matches[1] }
  elseif ($createOutput -match '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') { $DatabaseId = $Matches[1] }
  else { $DatabaseId = Read-Host 'Enter the existing or newly created D1 database ID' }
}
if ($DatabaseId -notmatch '^[0-9a-f-]{36}$') { throw 'D1 database ID 형식이 올바르지 않습니다.' }
Set-ConfigValue 'database_id\s*=\s*"[^"]*"' "database_id = `"$DatabaseId`""

$bucketList = Invoke-Wrangler @('r2', 'bucket', 'list')
if ($bucketList -notmatch [regex]::Escape($BucketName)) {
  Invoke-Wrangler @('r2', 'bucket', 'create', $BucketName) | Out-Null
}

$accessToken = New-AccessToken
Write-Host '`nWorker 접근 토큰을 안전하게 등록합니다.' -ForegroundColor Cyan
Set-WorkerSecret 'API_TOKEN' $accessToken

Invoke-Wrangler @('d1', 'execute', $DatabaseName, '--remote', '--file=./schema.sql', '--yes') | Out-Null
$deployOutput = Invoke-Wrangler @('deploy')
$workerUrl = ([regex]::Match($deployOutput, 'https://[^\s]+\.workers\.dev')).Value.TrimEnd('.')
if (-not $workerUrl) { $workerUrl = Read-Host 'Enter the workers.dev URL shown by deploy' }

$envLines = @(
  "VITE_PUBLIC_URL=$VercelOrigin",
  "VITE_INVENTORY_APP_URL=$VercelOrigin/inventory.html",
  "VITE_INVENTORY_API_URL=$workerUrl",
  "VITE_INVENTORY_TOKEN=$accessToken"
)
Set-LocalEnvironment $envLines

Write-Host '`n설정 완료' -ForegroundColor Green
Write-Host "Worker: $workerUrl"
Write-Host "Health: $workerUrl/health"
Write-Host "로컬 개발 환경: $localEnvPath"
Write-Host '`nVercel Project > Settings > Environment Variables에 아래 네 줄을 등록한 뒤 Redeploy 하세요.' -ForegroundColor Yellow
$envLines | ForEach-Object { Write-Host $_ }

if (-not $SkipVercel) {
  Write-Host '`nVercel CLI가 연결되어 있으면 다음 명령으로 배포할 수 있습니다: npx vercel --prod' -ForegroundColor DarkGray
}
