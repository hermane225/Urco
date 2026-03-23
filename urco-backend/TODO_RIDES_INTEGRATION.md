# TODO: Rides Integration Completion

## Plan Steps (Approved by user)

### [x] 1. Update rides.module.ts ✅

### [ ] 0. PREREQ: Update prisma/schema.prisma (CRITICAL - TS errors)
- Add model RideEvent { ... }
- Add model RideTracking { ... }
- Ride: add actualStartTime DateTime?, actualEndTime DateTime?
- BookingStatus enum: add CODE_SENT, CODE_VERIFIED, RIDE_IN_PROGRESS
- npx prisma generate && db push

### [ ] 2. Update rides.service.ts (after schema)
- Fix 'state' -> 'status' everywhere
- Fix BookingStatus strings
- getRideFullHistory: use ridesEventsService.getRideEvents()
- Fix other direct prisma.rideEvent queries if any

### [ ] 2. Update rides.service.ts
- Import RidesTrackingService
- Inject in constructor
- Replace direct Prisma rideTracking queries with service methods:
  - getRecentLocations() instead of findMany in getRideDetailedStats

### [ ] 3. Update rides.controller.ts
- Add POST /:rideId/start (StartRideDto, JwtAuthGuard)
- Add POST /:rideId/location (UpdateLocationDto, driver guard?)
- Add GET /:rideId/tracking (public/recent)
- Add GET /:rideId/tracking/latest
- Add GET /:rideId/events
- Add POST /:rideId/complete
- Add GET /:rideId/stats
- Add proper guards

### [ ] 4. Verify Prisma schema
- Check RideTracking, RideEvent models exist
- npx prisma db push if needed

### [ ] 5. Test
- npm run start:dev
- Run TEST_COMPLETE_FLOW.rest
- Manual test endpoints

Progress: Starting step 1...
