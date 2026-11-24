$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP "ebs-ai-hub-developer-kit-$PID"
$starterStage = Join-Path $stage 'starter'
$output = Join-Path $webDir 'public/downloads/ebs-ai-hub-app-developer-kit-v1.0.0.zip'

if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $starterStage 'scripts') | Out-Null
try {
  Copy-Item -LiteralPath (Join-Path $webDir 'developer-kit/README.md') -Destination (Join-Path $stage 'README.md')
  Copy-Item -LiteralPath (Join-Path $webDir 'developer-kit/APP_DEVELOPER_GUIDE.md') -Destination (Join-Path $stage 'APP_DEVELOPER_GUIDE.md')
  Copy-Item -LiteralPath (Join-Path $webDir 'public/developer-kit/guide/index.html') -Destination (Join-Path $stage 'APP_DEVELOPER_GUIDE.html')
  foreach ($file in @('README.md','package.json','aihub-app.json','app.js')) {
    Copy-Item -LiteralPath (Join-Path $webDir "developer-kit/starter/$file") -Destination (Join-Path $starterStage $file)
  }
  Copy-Item -LiteralPath (Join-Path $webDir 'developer-kit/starter/scripts/package-app.mjs') -Destination (Join-Path $starterStage 'scripts/package-app.mjs')
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $output -CompressionLevel Optimal -Force
  Write-Output "Developer kit packaged: $output"
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
