# Admin Features Implementation TODO

## Status: [ ] 0% Complete

### 1. Prisma Schema Updates [ ]
- [ ] Add RideRoute model (pickup->origin route)
- [ ] Add BookingStatus.DRIVER_ARRIVED_AT_PICKUP
- [ ] npx prisma db push

### 2. Users Module - Admin Management [ ]
- [ ] DTOs: ListUsersDto, UpdateUserRolesDto
- [ ] users.service.ts: listUsers(), deleteUser(), updateUserRoles()
- [ ] users.controller.ts: GET /admin/users, DELETE /admin/users/:id, PUT /admin/users/:id/roles
- [ ] GET /admin/drivers/pending (filter !driverLicenseVerified)

### 3. Rides Module - Admin Monitoring [ ]
- [ ] rides.service.ts: getActiveRidesAdmin(), getRideFullDetails()
- [ ] rides.controller.ts: GET /admin/rides/active, GET /admin/rides/:id/full
- [ ] Integrate live locations & tracking

### 4. Bookings - Client Geo to Driver [ ]
- [ ] bookings.service.ts: on CONFIRMED, create passenger LiveLocation
- [ ] Driver endpoint: GET /bookings/driver/nearby (w/ passenger loc)

### 5. Yango Geolocation Flow [ ]
- [ ] Add /bookings/:id/driver-arrived
- [ ] Compute route (mock or OpenRouteService)
- [ ] Store route in RideRoute, emit via WebSocket

### 6. Real-time Updates [ ]
- [ ] Emit location/route updates via messages.gateway

### 7. Testing [ ]
- [ ] Test all endpoints
- [ ] Update docs

Next step: 1. Prisma Schema
