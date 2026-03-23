# Urco Backend - Run on Port 3002
# This script runs the NestJS backend on port 3002 using proper PowerShell syntax

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting Urco Backend on Port 3002" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectDir = "c:\Users\hermane\mano\Urco\urco-backend"

# Set the PORT environment variable for this session
$env:PORT = "3002"

Write-Host "PORT set to: $env:PORT" -ForegroundColor Green
Write-Host ""

# Navigate to project directory
Set-Location $ProjectDir

Write-Host "Starting NestJS application..." -ForegroundColor Yellow
Write-Host ""

# Run the production build
npm run start:prod

