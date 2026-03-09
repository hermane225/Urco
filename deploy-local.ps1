# Urco Backend Deployment Script for Local Windows
# Run as: .\deploy-local.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Urco Backend Local Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ProjectDir = "c:\Users\hermane\mano\Urco\urco-backend"

# Couleurs
$GREEN = '#00FF00'
$YELLOW = '#FFFF00'
$RED = '#FF0000'

Write-Host "[1/6] Installing dependencies..." -ForegroundColor Yellow
Set-Location $ProjectDir
npm install

Write-Host "[2/6] Building application..." -ForegroundColor Yellow
npm run build

Write-Host "[3/6] Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate

Write-Host "[4/6] Checking database connection..." -ForegroundColor Yellow
# Note: Make sure PostgreSQL is running locally
# Database URL should be in .env file

Write-Host "[5/6] Running database migrations..." -ForegroundColor Yellow
npx prisma migrate deploy

Write-Host "[6/6] Starting application..." -ForegroundColor Yellow
npm run start:prod

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Application: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:3000/api/docs" -ForegroundColor Cyan
Write-Host ""

