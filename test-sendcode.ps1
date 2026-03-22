# Test send-code for non-existent user
$baseUrl = "http://localhost:3002/api/v1"

Write-Host "=== Testing send-code for non-existent user ===" -ForegroundColor Cyan

# Test 1: Send code to non-existent user
Write-Host "`nTest 1: POST /auth/send-code (new user)" -ForegroundColor Yellow
$response1 = Invoke-RestMethod -Uri "$baseUrl/auth/send-code" -Method Post -Body (@{ email = "newuser@test.com" } | ConvertTo-Json) -ContentType "application/json"
$response1 | ConvertTo-Json

Write-Host "`nTest 2: POST /auth/verify-code (wrong code)" -ForegroundColor Yellow
try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/auth/verify-code" -Method Post -Body (@{ email = "newuser@test.com"; code = "123456" } | ConvertTo-Json) -ContentType "application/json" -ErrorAction Stop
    $response2 | ConvertTo-Json
} catch {
    Write-Host "Error (expected): $($_.Exception.Response.StatusCode.value__)"
}

# Note: We can't test the full flow without a real email server
# But we can verify the logic works by checking the database
Write-Host "`n=== Tests completed ===" -ForegroundColor Green

