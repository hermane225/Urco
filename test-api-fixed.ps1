# ============================================================
# Test API Endpoint - Fixed Version
# Tests the correct signup endpoint
# ============================================================

$ServerIP = "82.165.35.28"
$Port = "3002"
$BaseURL = "http://${ServerIP}:${Port}/api/v1"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Testing Urco API Endpoints" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check (if exists)
Write-Host "[Test 1] GET / - Root endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseURL/" -Method GET -TimeoutSec 10 -UseBasicParsing
    Write-Host "  Status: $($response.StatusCode)" -ForegroundColor $(if ($response.StatusCode -eq 200) { "Green" } else { "Red" })
    Write-Host "  Response: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))" -ForegroundColor Gray
}
catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: CORRECT SIGNUP ENDPOINT (not /register!)
Write-Host "[Test 2] POST /auth/signup - Register new user (CORRECT endpoint)" -ForegroundColor Yellow
$signupBody = @{
    email     = "test$(Get-Random -Maximum 9999)@example.com"
    password  = "TestPassword123!"
    firstName = "Test"
    lastName  = "User"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseURL/auth/signup" `
        -Method POST `
        -Body $signupBody `
        -ContentType "application/json" `
        -TimeoutSec 10
    
    Write-Host "  Status: Success" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
}
catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "  HTTP Status: $statusCode" -ForegroundColor $(if ($statusCode -ge 400) { "Red" } else { "Yellow" })
    }
}
Write-Host ""

# Test 3: WRONG ENDPOINT (to show the issue)
Write-Host "[Test 3] POST /auth/register - Wrong endpoint (for comparison)" -ForegroundColor Yellow
Write-Host "  This should fail with 404 (route not found)" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "$BaseURL/auth/register" `
        -Method POST `
        -Body $signupBody `
        -ContentType "application/json" `
        -TimeoutSec 10
    
    Write-Host "  Status: Success (unexpected!)" -ForegroundColor Green
}
catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "  HTTP Status: $statusCode (expected 404)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Test 4: Check if returning HTML (the problem)
Write-Host "[Test 4] Check if endpoint returns HTML instead of JSON" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseURL/auth/signup" `
        -Method POST `
        -Body $signupBody `
        -ContentType "application/json" `
        -TimeoutSec 10
    
    if ($response.Content -match "<!DOCTYPE html>|<html|<script") {
        Write-Host "  PROBLEM DETECTED! Endpoint returns HTML!" -ForegroundColor Red
        Write-Host "  Content preview: $($response.Content.Substring(0, 200))" -ForegroundColor Red
    }
    else {
        Write-Host "  Response is JSON (correct)" -ForegroundColor Green
    }
}
catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Correct endpoint: POST $BaseURL/auth/signup" -ForegroundColor Green
Write-Host "Wrong endpoint:   POST $BaseURL/auth/register (returns 404)" -ForegroundColor Red
Write-Host ""
Write-Host "If you get HTML instead of JSON, the server is not running NestJS on port 3002." -ForegroundColor Yellow
Write-Host "Check on server: pm2 status" -ForegroundColor Gray
Write-Host "Check on server: curl http://localhost:3002/api/v1/auth/signup" -ForegroundColor Gray
Write-Host ""

