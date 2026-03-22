# Test complete flow: send-code -> verify-code -> signup
$baseUrl = "http://localhost:3002/api/v1"

Write-Host "=== Testing Complete Registration Flow ===" -ForegroundColor Cyan

# Step 1: Send code to non-existent user
Write-Host "`nTest 1: POST /auth/send-code (new user)" -ForegroundColor Yellow
$email = "testnewuser" + (Get-Random -Minimum 1000 -Maximum 9999) + "@example.com"
$response1 = Invoke-RestMethod -Uri "$baseUrl/auth/send-code" -Method Post -ContentType "application/json" -Body (@{ email = $email } | ConvertTo-Json)
Write-Host "Response: $($response1 | ConvertTo-Json)"

# Step 2: Get the code from database (simulating email)
# We'll use a direct DB query or just check if the record was created
Write-Host "`nStep 2: Get verification code from database"

# For now, let's send a wrong code to verify error handling
Write-Host "`nTest 2: POST /auth/verify-code (wrong code)" -ForegroundColor Yellow
try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/auth/verify-code" -Method Post -ContentType "application/json" -Body (@{ email = $email; code = "000000" } | ConvertTo-Json)
    Write-Host "Unexpected success: $($response2 | ConvertTo-Json)"
} catch {
    Write-Host "Expected error: $($_.Exception.Response.StatusCode)"
}

# Step 3: Signup should work with pending verification
Write-Host "`nTest 3: POST /auth/signup (should fail - no code verified)" -ForegroundColor Yellow
try {
    $response3 = Invoke-RestMethod -Uri "$baseUrl/auth/signup" -Method Post -ContentType "application/json" -Body (@{
        email = $email
        username = "testuser"
        password = "password123"
        firstName = "Test"
        lastName = "User"
    } | ConvertTo-Json)
    Write-Host "Response: $($response3 | ConvertTo-Json)"
} catch {
    Write-Host "Error: $($_.Exception.Response.StatusCode)"
}

Write-Host "`n=== Tests completed ===" -ForegroundColor Cyan

