# ============================================================
# Detailed API Diagnostic Test
# Identifies response type issues
# ============================================================

param(
    [string]$BaseURL = "http://82.165.35.28:3002/api/v1"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Detailed API Diagnostic Test" -ForegroundColor Cyan
Write-Host "  URL: $BaseURL" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Endpoint = "",
        [object]$Body = $null,
        [hashtable]$Headers = @{}
    )
    
    Write-Host "`n[$Method] $Endpoint" -ForegroundColor Yellow
    Write-Host "Testing: $Name" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = "$BaseURL$Endpoint"
            Method = $Method
            TimeoutSec = 15
            UseBasicParsing = $true
        }
        
        if ($Body) {
            $params.Body = $Body | ConvertTo-Json
            $params.ContentType = "application/json"
        }
        
        if ($Headers.Count -gt 0) {
            $params.Headers = $Headers
        }
        
        $response = Invoke-WebRequest @params
        
        $contentType = $response.Headers["Content-Type"]
        $statusCode = $response.StatusCode
        $content = $response.Content
        
        Write-Host "  Status: $statusCode" -ForegroundColor $(if ($statusCode -ge 200 -and $statusCode -lt 300) { "Green" } else { "Red" })
        Write-Host "  Content-Type: $contentType" -ForegroundColor $(if ($contentType -match "application/json") { "Green" } else { "Red" })
        
        # Check if response is HTML
        if ($content -match "<!DOCTYPE|<html|<script|replit") {
            Write-Host "  ❌ ERROR: Response is HTML, not JSON!" -ForegroundColor Red
            Write-Host "  Content preview: $($content.Substring(0, [Math]::Min(150, $content.Length)))" -ForegroundColor Red
            return @{ Success = $false; IsHTML = $true; Status = $statusCode }
        }
        
        # Try to parse as JSON
        try {
            $json = $content | ConvertFrom-Json
            Write-Host "  ✅ JSON Response received" -ForegroundColor Green
            Write-Host "  Data: $($json | ConvertTo-Json -Compress -Depth 3)" -ForegroundColor Gray
            return @{ Success = $true; Data = $json; Status = $statusCode }
        } catch {
            Write-Host "  ❌ ERROR: Cannot parse as JSON" -ForegroundColor Red
            Write-Host "  Content: $($content.Substring(0, [Math]::Min(200, $content.Length)))" -ForegroundColor Red
            return @{ Success = $false; IsJSON = $false; Status = $statusCode }
        }
        
    } catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            Write-Host "  HTTP Status: $statusCode" -ForegroundColor Red
        }
        return @{ Success = $false; Error = $_.Exception.Message }
    }
}

# Test 1: Root endpoint
$result1 = Test-Endpoint -Name "Root Endpoint" -Endpoint "/"

# Test 2: Auth Signup
$signupBody = @{
    email     = "diag$(Get-Random -Maximum 99999)@test.com"
    password  = "TestPassword123!"
    firstName = "Diagnostic"
    lastName  = "Test"
}
$result2 = Test-Endpoint -Name "User Signup" -Method "POST" -Endpoint "/auth/signup" -Body $signupBody

# Test 3: Auth Login
$loginBody = @{
    email    = "diag$(Get-Random -Maximum 99999)@test.com"
    password = "TestPassword123!"
}
$result3 = Test-Endpoint -Name "User Login" -Method "POST" -Endpoint "/auth/login" -Body $loginBody

# Test 4: Get Users
$result4 = Test-Endpoint -Name "Get All Users" -Endpoint "/users"

# Test 5: Get Rides
$result5 = Test-Endpoint -Name "Get All Rides" -Endpoint "/rides"

# Test 6: Get Bookings
$result6 = Test-Endpoint -Name "Get All Bookings" -Endpoint "/bookings"

# Test 7: Get Alerts
$result7 = Test-Endpoint -Name "Get All Alerts" -Endpoint "/alerts"

# Summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$issues = @()

if ($result1.IsHTML) { $issues += "Root endpoint returns HTML instead of JSON" }
if ($result2.IsHTML) { $issues += "Auth Signup returns HTML instead of JSON" }
if ($result3.IsHTML) { $issues += "Auth Login returns HTML instead of JSON" }
if ($result4.IsHTML) { $issues += "Users endpoint returns HTML instead of JSON" }
if ($result5.IsHTML) { $issues += "Rides endpoint returns HTML instead of JSON" }
if ($result6.IsHTML) { $issues += "Bookings endpoint returns HTML instead of JSON" }
if ($result7.IsHTML) { $issues += "Alerts endpoint returns HTML instead of JSON" }

if ($issues.Count -eq 0) {
    Write-Host "✅ All endpoints working correctly!" -ForegroundColor Green
} else {
    Write-Host "❌ Issues detected:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "  - $issue" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Key Findings:" -ForegroundColor Cyan
Write-Host "  - Root endpoint: Returns $($result1.Status)" -ForegroundColor Gray
Write-Host "  - Auth endpoints status: signup=$($result2.Status), login=$($result3.Status)" -ForegroundColor Gray
Write-Host "  - Data endpoints status: users=$($result4.Status), rides=$($result5.Status), bookings=$($result6.Status), alerts=$($result7.Status)" -ForegroundColor Gray
Write-Host ""

