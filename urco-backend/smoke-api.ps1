$base = 'http://localhost:3002/api/v1'

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers,
        [object]$Body
    )

    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 10
            $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -Body $json -ContentType 'application/json'
        }
        else {
            $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
        }

        Write-Output "[PASS] $Name"
        return @{ ok = $true; data = $resp }
    }
    catch {
        $status = $null
        $msg = $_.Exception.Message
        Write-Output "[FAIL] $Name | status=$status | msg=$msg"
        return @{ ok = $false; status = $status; message = $msg }
    }
}

$h = Test-Endpoint -Name 'Health' -Method 'GET' -Url "$base/health" -Headers @{} -Body $null

$login = Test-Endpoint -Name 'Auth Login' -Method 'POST' -Url "$base/auth/login" -Headers @{} -Body @{ email = 'mj2190175@gmail.com'; password = 'Junior225' }
if (-not $login.ok) {
    Write-Output 'LOGIN_FAILED'
    exit 1
}

$token = $login.data.access_token
if (-not $token) { $token = $login.data.accessToken }
if (-not $token) { $token = $login.data.token }
if (-not $token) {
    Write-Output '[FAIL] Token absent dans la reponse login'
    exit 1
}

$auth = @{ Authorization = "Bearer $token" }

$p = Test-Endpoint -Name 'Auth Profile' -Method 'GET' -Url "$base/auth/profile" -Headers $auth -Body $null
$r = Test-Endpoint -Name 'Rides List Public' -Method 'GET' -Url "$base/rides" -Headers @{} -Body $null
$rb = Test-Endpoint -Name 'Rides Booked (auth)' -Method 'GET' -Url "$base/rides/booked" -Headers $auth -Body $null
$b = Test-Endpoint -Name 'Bookings List (auth)' -Method 'GET' -Url "$base/bookings/bookings" -Headers $auth -Body $null

$randomId = [guid]::NewGuid().ToString()
$vc = Test-Endpoint -Name 'Booking Validate-Code Route' -Method 'POST' -Url "$base/bookings/bookings/$randomId/validate-code" -Headers $auth -Body @{ code = '1234' }

Write-Output '--- SUMMARY ---'
Write-Output ("Health={0}; Login={1}; Profile={2}; Rides={3}; RidesBooked={4}; Bookings={5}; ValidateCodeRoute={6}" -f $h.ok, $login.ok, $p.ok, $r.ok, $rb.ok, $b.ok, $vc.ok)
