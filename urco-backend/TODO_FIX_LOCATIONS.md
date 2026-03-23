# Fix /api/v1/locations 404 - Add public all active locations endpoint

## Status: Approved by user ✅

## Steps:

- [x] 1. Update locations.service.ts: Add `getAllActiveLiveLocations()` method ✅ (fixed TS errors)
- [x] 2. Update locations.controller.ts: Restructure endpoints (public @Get() for all, @Get('me') and POST with auth) ✅
- [x] 3. Local test: npm run start:dev && curl http://localhost:3000/api/v1/locations
- [ ] 4. Build: npm run build
- [ ] 5. Deploy to prod VPS
- [ ] 6. Verify prod: curl -k https://urco.blueredc.com/api/v1/locations

**Progress: 3/6**

