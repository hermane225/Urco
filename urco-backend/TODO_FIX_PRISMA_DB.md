# Prisma DB Migration Fix - Progress Tracker

## Plan Status: 🚀 IN PROGRESS

### 1. [✅] VPS Manual Cleanup Guide Created 
### 2. [ ] User runs manual DB cleanup on VPS (check TODO below) 
### 3. [ ] Edit schema.prisma (remove unused enum values, drop redundant `role`)
### 4. [ ] Update users.service.ts, controller.ts, DTOs for roles array only
### 5. [ ] Test locally (npx prisma db push && npm run start:dev)
### 6. [ ] git commit/push, VPS git pull + prisma db push
### 7. [ ] Mark complete ✅

**Priority: HIGH - Blocks deployment**

## VPS Manual Cleanup Commands (run as root@my-vps:~# cd /var/www/urco-backend):

**⚠️ BACKUP FIRST:**
```
pg_dump \"$DATABASE_URL\" > prisma_backup_$(date +%Y%m%d_%H%M%S).sql
```

**Connect & Diagnose:**
```
psql \"$DATABASE_URL\"
\\dT | grep _old
SELECT * FROM \"User\" WHERE 'ADMIN' = ANY(roles) OR role = 'ADMIN';
SELECT * FROM \"Booking\" WHERE status IN ('CODE_SENT','CODE_VERIFIED','RIDE_IN_PROGRESS','DRIVER_ARRIVED_AT_PICKUP');
```

**Drop Old Types (if no data loss):**
```
DROP TYPE IF EXISTS \"UserRole_old\" CASCADE;
DROP TYPE IF EXISTS \"BookingStatus_old\" CASCADE;
-- Add any other _old found
\\q
```

**Retry:**
```
npx prisma generate
npx prisma db push --accept-data-loss
```

**Success indicators: No warnings/errors, Client generated.**

**If fails with data: Ask for SELECT output to migrate data first.**
