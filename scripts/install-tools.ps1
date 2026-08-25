# Git and Node.js Installation Script
Write-Host "=== Git and Node.js Installation Script ===" -ForegroundColor Cyan
Write-Host ""

# Install Git
Write-Host "Installing Git..." -ForegroundColor Yellow
try {
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
    Write-Host "Git installation completed!" -ForegroundColor Green
} catch {
    Write-Host "Git installation failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Waiting 10 seconds before installing Node.js..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Install Node.js LTS
Write-Host "Installing Node.js LTS..." -ForegroundColor Yellow
try {
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-package-agreements --accept-source-agreements
    Write-Host "Node.js installation completed!" -ForegroundColor Green
} catch {
    Write-Host "Node.js installation failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Refreshing environment variables..." -ForegroundColor Yellow
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host ""
Write-Host "=== Verifying Installations ===" -ForegroundColor Cyan

# Verify Git
Write-Host ""
Write-Host "Git version:" -ForegroundColor Yellow
try {
    git --version
} catch {
    Write-Host "Git not found in PATH. You may need to restart your terminal." -ForegroundColor Red
}

# Verify Node.js
Write-Host ""
Write-Host "Node.js version:" -ForegroundColor Yellow
try {
    node --version
} catch {
    Write-Host "Node.js not found in PATH. You may need to restart your terminal." -ForegroundColor Red
}

# Verify npm
Write-Host ""
Write-Host "npm version:" -ForegroundColor Yellow
try {
    npm --version
} catch {
    Write-Host "npm not found in PATH. You may need to restart your terminal." -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Green
Write-Host "Please restart your terminal or VS Code to use the newly installed tools." -ForegroundColor Yellow

# Made with Bob
