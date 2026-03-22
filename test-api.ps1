# Test API Endpoint
$body = @{
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://82.165.35.28:3002/api/v1/auth/login" -Method POST -ContentType "application/json" -Body $body
    Write-Host "Status: Success"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Status: Failed"
    Write-Host $_.Exception.Response.StatusCode.value__
    Write-Host $_.ErrorDetails.Message
}

