$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3003/api/v1'

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
        Write-Output "[FAIL] $Name | $($_.Exception.Message)"
        return @{ ok = $false; message = $_.Exception.Message }
    }
}

$login = Test-Endpoint -Name 'Auth Login' -Method 'POST' -Url "$base/auth/login" -Headers @{} -Body @{ email = 'mj2190175@gmail.com'; password = 'Junior225' }
if (-not $login.ok) { exit 1 }

$token = $login.data.access_token
if (-not $token) { $token = $login.data.accessToken }
if (-not $token) { $token = $login.data.token }
if (-not $token) {
    Write-Output '[FAIL] Token absent'
    exit 1
}

$auth = @{ Authorization = "Bearer $token" }

$enable = Test-Endpoint -Name 'Enable Driver Mode' -Method 'POST' -Url "$base/users/profile/enable-driver" -Headers $auth -Body $null
if (-not $enable.ok) { exit 1 }

$departure = (Get-Date).AddDays(1).ToString('yyyy-MM-ddTHH:mm:ss.000Z')
$plateNumber = "AB-$((Get-Random -Minimum 100 -Maximum 999))-CD"

$rideBody = @{
    origin         = 'Cocody'
    destination    = 'Plateau'
    originLat      = 5.362
    originLng      = -3.987
    destLat        = 5.320
    destLng        = -4.016
    departureDate  = $departure
    departureTime  = '10:30'
    pricePerSeat   = 1500
    availableSeats = 3
    vehicleModel   = 'Toyota'
    vehicleColor   = 'Black'
    vehiclePlate   = $plateNumber
}

$ride = Test-Endpoint -Name 'Create Ride' -Method 'POST' -Url "$base/rides" -Headers $auth -Body $rideBody
if (-not $ride.ok) { exit 1 }
$rideId = $ride.data.id

$booking = Test-Endpoint -Name 'Book Ride (same account)' -Method 'POST' -Url "$base/rides/$rideId/book" -Headers $auth -Body @{ seats = 1; passengerLat = 5.355; passengerLng = -4.001; message = 'Test e2e' }
if (-not $booking.ok) { exit 1 }
$bookingId = $booking.data.id

$bookingsView = Test-Endpoint -Name 'Driver Ride Bookings View' -Method 'GET' -Url "$base/rides/$rideId/bookings" -Headers $auth -Body $null
$liveView = Test-Endpoint -Name 'Driver Booking Live View' -Method 'GET' -Url "$base/rides/$rideId/bookings/$bookingId/live" -Headers $auth -Body $null
$tracking = Test-Endpoint -Name 'Update Driver Tracking' -Method 'POST' -Url "$base/rides/$rideId/tracking" -Headers $auth -Body @{ driverLat = 5.350; driverLng = -4.000; accuracy = 7; heading = 180; speed = 22 }

Write-Output '--- SUMMARY ---'
Write-Output ("EnableDriver={0}; CreateRide={1}; Book={2}; RideBookingsView={3}; LiveView={4}; Tracking={5}; RideId={6}; BookingId={7}" -f $enable.ok, $ride.ok, $booking.ok, $bookingsView.ok, $liveView.ok, $tracking.ok, $rideId, $bookingId)
