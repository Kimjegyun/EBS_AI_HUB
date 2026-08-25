# AI HUB Local Server Setup Script
# This script automatically sets up the backend server structure

Write-Host "=== AI HUB Local Server Setup ===" -ForegroundColor Cyan
Write-Host ""

# Create server directory structure
Write-Host "Creating directory structure..." -ForegroundColor Yellow
$directories = @(
    "server/src/config",
    "server/src/controllers",
    "server/src/middleware",
    "server/src/models",
    "server/src/routes",
    "server/src/services",
    "server/src/utils",
    "server/src/scripts",
    "server/data",
    "server/logs",
    "server/backups"
)

foreach ($dir in $directories) {
    $fullPath = Join-Path $PSScriptRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "  Created: $dir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Directory structure created successfully!" -ForegroundColor Green
Write-Host ""

# Create .env file if it doesn't exist
$envPath = Join-Path $PSScriptRoot "server/.env"
if (-not (Test-Path $envPath)) {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    @"
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# JWT Configuration
JWT_SECRET=ai-hub-local-secret-key-$(Get-Random)
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Database Configuration
DATABASE_PATH=./data/aihub.db

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/server.log

# Admin Configuration
ADMIN_EMAIL=admin@company.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=System Administrator
"@ | Out-File -FilePath $envPath -Encoding UTF8
    Write-Host "  .env file created" -ForegroundColor Green
}

Write-Host ""
Write-Host "Installing server dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $PSScriptRoot "server")

if (Test-Path "package.json") {
    npm install
    Write-Host ""
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
} else {
    Write-Host "  package.json not found. Please run the file creation script first." -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the server:" -ForegroundColor Yellow
Write-Host "  cd server" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""

# Made with Bob
