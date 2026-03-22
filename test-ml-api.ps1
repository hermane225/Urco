# ============================================================
# Comprehensive API Test Script
# Tests all main endpoints of the Urco API
# ============================================================

param(
    [string]$BaseURL = "http://82.165.35.28:3002/api/v1"
)

# Colors for output
function Write-TestResult {
    param([string]$Name, [string]$Status, [string]$Details = "")
    $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host "[$Status] $Name" -ForegroundColor $color
    if ($Details) { Write-Host "       $Details" -ForegroundColor Gray }
}

function Test-IsHtmlResponse {
    param([object]$Response)
    return ($Response -is [string] -and $Response -match "<!DOCTYPE|<html|<script|replit")
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Testing Urco API: $BaseURL" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$global:authToken = $null
$global:testEmail = "test$(Get-Random -Maximum 9999)@example.com"
$global:testPassword = "TestPassword123!"

# ============================================================
# Test 1: Root Endpoint (Health Check)
# ============================================================
Write-Host "`n[Test 1] GET / - Root Endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseURL/" -Method GET -TimeoutSec 10 -UseBasicParsing
    $contentType = $response.Headers["Content-Type"]
    if ($contentType -match "application/json") {
        Write-TestResult "Root endpoint" "PASS" "Status: $($response.StatusCode), Content-Type: $contentType"
    } else {
        Write-TestResult "Root endpoint" "FAIL" "Expected JSON but got Content-Type: $contentType"
    }
}
catch {
    Write-TestResult "Root endpoint" "FAIL" $_.Exception.Message
}

# ============================================================
# Test 2: User Signup
# ============================================================
Write-Host "`n[Test 2] POST /auth/signup - Register new user" -ForegroundColor Yellow
$signupBody = @{
    email     = $global:testEmail
    password  = $global:testPassword
    firstName = "Test"
    lastName  = "User"
    phone     = "+1234567890"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseURL/auth/signup" `
        -Method POST `
        -Body $signupBody `
        -ContentType "application/json" `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "User signup" "FAIL" "HTML response received instead of JSON"
    } else {
        Write-TestResult "User signup" "PASS" "Response: $($response | ConvertTo-Json -Compress)"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "User signup" "FAIL" "HTTP $statusCode - $($_.Exception.Message)"
}

# ============================================================
# Test 3: User Login
# ============================================================
Write-Host "`n[Test 3] POST /auth/login - User login" -ForegroundColor Yellow
$loginBody = @{
    email    = $global:testEmail
    password = $global:testPassword
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseURL/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "User login" "FAIL" "HTML response received instead of JSON"
    }
    elseif ($response.access_token) {
        $global:authToken = $response.access_token
        Write-TestResult "User login" "PASS" "Token received: $($global:authToken.Substring(0, 20))..."
    }
    else {
        Write-TestResult "User login" "FAIL" "No token in response"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "User login" "FAIL" "HTTP $statusCode"
}

# ============================================================
# Test 4: Get User Profile (requires auth)
# ============================================================
if ($global:authToken) {
    Write-Host "`n[Test 4] GET /auth/profile - Get user profile" -ForegroundColor Yellow
    try {
        $headers = @{
            "Authorization" = "Bearer $global:authToken"
        }
        $response = Invoke-RestMethod -Uri "$BaseURL/auth/profile" `
            -Method GET `
            -Headers $headers `
            -TimeoutSec 10

        if (Test-IsHtmlResponse $response) {
            Write-TestResult "Get profile" "FAIL" "HTML response received instead of JSON"
        } else {
            Write-TestResult "Get profile" "PASS" "Email: $($response.email)"
        }
    }
    catch {
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
        Write-TestResult "Get profile" "FAIL" "HTTP $statusCode"
    }
}
else {
    Write-Host "`n[Test 4] GET /auth/profile - Skipped (no token)" -ForegroundColor Gray
}

# ============================================================
# Test 5: Send Verification Code
# ============================================================
Write-Host "`n[Test 5] POST /auth/send-code - Send verification code" -ForegroundColor Yellow
$sendCodeBody = @{
    email = $global:testEmail
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseURL/auth/send-code" `
        -Method POST `
        -Body $sendCodeBody `
        -ContentType "application/json" `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "Send verification code" "FAIL" "HTML response received instead of JSON"
    } else {
        Write-TestResult "Send verification code" "PASS" "Response: $($response | ConvertTo-Json -Compress)"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "Send verification code" "FAIL" "HTTP $statusCode"
}

# ============================================================
# Test 6: Get All Users (Admin endpoint)
# ============================================================
Write-Host "`n[Test 6] GET /users - Get all users" -ForegroundColor Yellow
try {
    $headers = @{}
    if ($global:authToken) {
        $headers["Authorization"] = "Bearer $global:authToken"
    }
    
    $response = Invoke-RestMethod -Uri "$BaseURL/users" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "Get all users" "FAIL" "HTML response received instead of JSON"
    }
    elseif ($response -is [System.Array]) {
        Write-TestResult "Get all users" "PASS" "Users count: $($response.Count)"
    } else {
        Write-TestResult "Get all users" "FAIL" "Expected an array response"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "Get all users" "FAIL" "HTTP $statusCode"
}

# ============================================================
# Test 7: Get All Rides
# ============================================================
Write-Host "`n[Test 7] GET /rides - Get all rides" -ForegroundColor Yellow
try {
    $headers = @{}
    if ($global:authToken) {
        $headers["Authorization"] = "Bearer $global:authToken"
    }
    
    $response = Invoke-RestMethod -Uri "$BaseURL/rides" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "Get all rides" "FAIL" "HTML response received instead of JSON"
    }
    elseif ($response -is [System.Array]) {
        Write-TestResult "Get all rides" "PASS" "Rides count: $($response.Count)"
    } else {
        Write-TestResult "Get all rides" "FAIL" "Expected an array response"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "Get all rides" "FAIL" "HTTP $statusCode"
}

# ============================================================
# Test 8: Get All Bookings
# ============================================================
Write-Host "`n[Test 8] GET /bookings - Get all bookings" -ForegroundColor Yellow
try {
    $headers = @{}
    if ($global:authToken) {
        $headers["Authorization"] = "Bearer $global:authToken"
    }
    
    $response = Invoke-RestMethod -Uri "$BaseURL/bookings" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "Get all bookings" "FAIL" "HTML response received instead of JSON"
    }
    elseif ($response -is [System.Array]) {
        Write-TestResult "Get all bookings" "PASS" "Bookings count: $($response.Count)"
    } else {
        Write-TestResult "Get all bookings" "FAIL" "Expected an array response"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "Get all bookings" "FAIL" "HTTP $statusCode"
}

# ============================================================
# Test 9: Get All Alerts
# ============================================================
Write-Host "`n[Test 9] GET /alerts - Get all alerts" -ForegroundColor Yellow
try {
    $headers = @{}
    if ($global:authToken) {
        $headers["Authorization"] = "Bearer $global:authToken"
    }
    
    $response = Invoke-RestMethod -Uri "$BaseURL/alerts" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 10

    if (Test-IsHtmlResponse $response) {
        Write-TestResult "Get all alerts" "FAIL" "HTML response received instead of JSON"
    }
    elseif ($response -is [System.Array]) {
        Write-TestResult "Get all alerts" "PASS" "Alerts count: $($response.Count)"
    } else {
        Write-TestResult "Get all alerts" "FAIL" "Expected an array response"
    }
}
catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "N/A" }
    Write-TestResult "Get all alerts" "FAIL" "HTTP $statusCode"
}

# ============================================================
# Summary
# ============================================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Base URL: $BaseURL" -ForegroundColor Gray
Write-Host "Test Email: $global:testEmail" -ForegroundColor Gray
Write-Host ""

