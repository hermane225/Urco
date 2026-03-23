# Test URCO Backend Geo/Mapbox Flow
# Run: powershell.exe -ExecutionPolicy Bypass -File test-geo-flow.ps1

Write-Host "1. Start server if not running: npm run start:dev (manual)"
Write-Host "2. Add MAPBOX_TOKEN to .env (manual)"
Write-Host "3. Test endpoints with curl or Postman"

Write-Host "`n=== Auth ==="
$token = (curl -s -X POST http://localhost:3000/auth/signup -H "Content-Type: application/json" -d '{\"email\":\"test@test.com\",\"password\":\"pass123\",\"firstName\":\"Test\",\"lastName\":\"User\",\"username\":\"testuser\"}' | ConvertFrom-Json).token
Write-Host "Token: $token"

Write-Host "`n=== Create Ride with Geo ==="
$rideId = (curl -s -X POST http://localhost:3000/rides -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d '{\"origin\":\"Paris\",\"destination\":\"Lyon\",\"originLat\":48.8566,\"originLng\":2.3522,\"destLat\":45.7640,\"destLng\":4.8357,\"departureDate\":\"2024-10-20T10:00:00\",\"departureTime\":\"10:00\",\"pricePerSeat\":20,\"availableSeats\":3,\"vehicleModel\":\"Renault\",\"vehicleColor\":\"Blue\",\"vehiclePlate\":\"AB-123-CD\"}' | ConvertFrom-Json).id
Write-Host "Ride ID: $rideId"

Write-Host "`n=== Create Booking with Position & Get Code ==="
$bookingId = (curl -s -X POST "http://localhost:3000/rides/$rideId/book" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d '{\"seats\":1,\"passengerLat\":48.85,\"passengerLng\":2.35,\"message\":\"Pick me up here\"}' | ConvertFrom-Json).id
Write-Host "Booking ID: $bookingId - Check response for securityCode"

Write-Host "`n=== Validate Security Code (replace XXXX with code from response) ==="
# curl -X POST "http://localhost:3000/bookings/$bookingId/validate-code" -H "Content-Type: application/json" -d '{\"code\":\"4827\"}' -H "Authorization: Bearer $token"

Write-Host "`n=== Update Live Location ==="
curl -X POST http://localhost:3000/locations -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d '{\"lat\":48.8566,\"lng\":2.3522,\"bookingId\":\"'$bookingId'\"}'

Write-Host "`n=== Mark Driver Arrived ==="
curl -X PUT "http://localhost:3000/bookings/$bookingId/driver-arrived" -H "Authorization: Bearer $token"

Write-Host "`n=== Nearby Rides ==="
curl "http://localhost:3000/rides/nearby?lat=48.85&lng=2.35&radius=50"

Write-Host "`nTests complete! Check responses & TODO.md"
