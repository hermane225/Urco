# Build Fix TODO

## Status: In Progress

**Step 1: [PENDING] Create TODO.md and start fixes**

**Step 2: Fix auth.service.ts**
- Replace 'baimport' with 'import'
- Fix all PendingEmailVerification → pendingEmailVerification (6+ instances)
- Remove embedded \\n from Prisma queries

**Step 3: Fix locations.service.ts** 
- Clean import statements (remove 'keackendkend' garbage)
- Fix all LiveLocation → liveLocation (5+ instances)
- Remove embedded \\n from Prisma queries
- Ensure getAllActiveLiveLocations() works

**Step 4: Test build**
- cd Urco/urco-backend && npm run build

**Step 5: Complete**

