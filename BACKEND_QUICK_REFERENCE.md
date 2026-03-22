# 🗂️ Backend Structure - Quick Reference Guide

## 📁 Directory Structure

```
urco-backend/
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts                    ← Auth protection
│   │   └── strategies/
│   │       └── jwt.strategy.ts
│   │
│   ├── users/
│   │   ├── users.controller.ts                      ← User & admin endpoints
│   │   ├── users.service.ts                         ← User operations
│   │   ├── users.module.ts
│   │   └── dto/
│   │       ├── users.dto.ts                         ← UserRole enum
│   │       └── admin-users.dto.ts                   ← Admin filtering/update DTOs
│   │
│   ├── rides/
│   │   ├── rides.controller.ts                      ← Ride CRUD + lifecycle
│   │   ├── rides.service.ts                         ← Ride logic (1200+ LOC)
│   │   ├── rides.module.ts
│   │   ├── rides-tracking.service.ts ⭐               ← GPS location tracking
│   │   ├── rides-events.service.ts ⭐                ← Audit trail events
│   │   ├── dto/
│   │   │   ├── rides.dto.ts                         ← CreateRideDto, UpdateRideDto
│   │   │   └── update-location.dto.ts               ← Location update validation
│   │
│   ├── bookings/
│   │   ├── bookings.controller.ts                   ← Booking endpoints
│   │   ├── bookings.service.ts                      ← Booking lifecycle (400+ LOC)
│   │   ├── bookings.module.ts
│   │   └── dto/
│   │       ├── bookings.dto.ts                      ← CreateBookingDto
│   │       └── validate-booking.dto.ts              ← Code validation DTO
│   │
│   ├── messages/
│   │   ├── messages.gateway.ts ⭐                    ← WebSocket Gateway
│   │   ├── messages.service.ts                      ← Message operations
│   │   ├── messages.controller.ts
│   │   ├── messages.module.ts
│   │   └── dto/
│   │       └── messages.dto.ts
│   │
│   ├── alerts/
│   │   ├── alerts.controller.ts
│   │   ├── alerts.service.ts
│   │   ├── alerts.module.ts
│   │   └── dto/
│   │
│   ├── prisma/
│   │   ├── prisma.service.ts                        ← DB connection
│   │   └── prisma.module.ts
│   │
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── app.module.ts                                ← Root module imports all
│   └── main.ts                                      ← Bootstrap
│
├── prisma/
│   └── schema.prisma ⭐                              ← Data models (250+ LOC)
│
├── test/
│   └── app.e2e-spec.ts
│
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
└── eslint.config.mjs
```

---

## 🎯 Key Files by Feature

### 1️⃣ ADMIN FEATURES
```
├── src/users/dto/admin-users.dto.ts          ListUsersQuery, UpdateUserRolesDto
├── src/users/users.controller.ts (L85)       verifyUser endpoint
├── src/users/users.service.ts                verifyUser, uploadDocument
└── src/auth/guards/jwt-auth.guard.ts         Authorization check
```

### 2️⃣ DRIVER FEATURES - RIDE MANAGEMENT
```
├── src/rides/rides.controller.ts             POST/GET/PATCH /rides
├── src/rides/rides.service.ts (1200+ LOC)    
│   ├── createRide()
│   ├── startRide()                           Generate security codes
│   ├── completeRide()
│   ├── cancelRide()
│   └── getRideById()
├── src/rides/dto/rides.dto.ts                CreateRideDto, UpdateRideDto
└── src/rides/rides.module.ts
```

### 3️⃣ DRIVER FEATURES - LOCATION TRACKING
```
├── src/rides/rides-tracking.service.ts ⭐     (150+ LOC - NEW)
│   ├── updateDriverLocation()                POST new GPS point
│   ├── getRideTrackingHistory()              Get all points
│   ├── getLatestLocation()                   Last known position
│   ├── getRecentLocations()                  Last N points
│   └── calculateDistance()                   Haversine formula
├── src/rides/rides.controller.ts (L97)       POST/GET tracking endpoints
└── prisma/schema.prisma                      RideTracking model
```

### 4️⃣ DRIVER FEATURES - AUDIT TRAIL
```
├── src/rides/rides-events.service.ts ⭐      (100+ LOC - NEW)
│   ├── createRideEvent()                     Log action
│   ├── getRideEvents()                       Audit trail
│   ├── getAuditTrail()                       Admin view
│   ├── countEventsByType()                   Statistics
│   └── getRideStats()                        Event summary
├── src/rides/rides.controller.ts (L143)      GET events endpoints
└── prisma/schema.prisma                      RideEvent model
```

### 5️⃣ PASSENGER FEATURES - BOOKING
```
├── src/bookings/bookings.controller.ts       POST/PUT bookings endpoints
├── src/bookings/bookings.service.ts (400+ LOC)
│   ├── createBooking()                       PENDING status
│   ├── getUserBookings()
│   ├── getDriverBookings()
│   ├── updateBookingStatus()
│   ├── validateSecurityCode()                CODE_VERIFIED logic
│   └── markDriverArrived()
├── src/bookings/dto/bookings.dto.ts         CreateBookingDto
├── src/bookings/dto/validate-booking.dto.ts  VerifyCodeDto
└── prisma/schema.prisma                      Booking model
```

### 6️⃣ PASSENGER FEATURES - ROUTING
```
├── src/rides/rides.service.ts
│   ├── getNearbyRides()                      Location search
│   ├── getRides()                            Text search
│   └── reverseGeocode()                      Address lookup
└── prisma/schema.prisma                      RideRoute model
```

### 7️⃣ GEOLOCATION
```
├── src/rides/rides-tracking.service.ts
│   └── calculateDistance()                   Haversine formula
├── src/rides/rides.service.ts
│   └── reverseGeocode()                      Google Maps API
├── src/rides/dto/rides.dto.ts                GPS validation (@Min/@Max)
└── prisma/schema.prisma                      GPS fields in Ride, Booking, LiveLocation
```

### 8️⃣ REAL-TIME COMMUNICATION
```
├── src/messages/messages.gateway.ts ⭐       Socket.io WebSocket
│   ├── handleConnection()
│   ├── handleDisconnect()
│   ├── joinConversation()
│   ├── sendMessage()
│   └── markAsRead()
├── src/messages/messages.service.ts          Message/Conversation CRUD
├── src/messages/messages.controller.ts       HTTP endpoints
├── src/messages/messages.module.ts           Exports gateway
└── prisma/schema.prisma                      Conversation, Message models
```

---

## 🔑 Key Functions Index

### Authentication & Authorization
| Function | File | Purpose |
|----------|------|---------|
| `JwtAuthGuard` | auth/guards/jwt-auth.guard.ts | Protect endpoints |
| Admin check | users.controller.ts:89 | `isAdmin \|\| role === 'ADMIN' \|\| roles.includes('ADMIN')` |

### Ride Management
| Function | File | Purpose |
|----------|------|---------|
| `createRide()` | rides.service.ts | Post new ride (becomes DRIVER) |
| `startRide()` | rides.service.ts:365 | Start journey + generate codes |
| `completeRide()` | rides.service.ts:438 | End journey + cleanup |
| `cancelRide()` | rides.service.ts:490 | Cancel + cascade to bookings |
| `getRideById()` | rides.service.ts | Full ride details |
| `getRideSummary()` | rides.service.ts:569 | Summary + stats |

### Location Tracking
| Function | File | Purpose |
|----------|------|---------|
| `updateDriverLocation()` | rides-tracking.service.ts:16 | Store GPS point |
| `getRideTrackingHistory()` | rides-tracking.service.ts:52 | All points for ride |
| `getLatestLocation()` | rides-tracking.service.ts:64 | Last driver position |
| `getRecentLocations()` | rides-tracking.service.ts:74 | Last N points |
| `calculateDistance()` | rides-tracking.service.ts:84 | Haversine formula |

### Events & Audit
| Function | File | Purpose |
|----------|------|---------|
| `createRideEvent()` | rides-events.service.ts:14 | Log event with timestamp |
| `getRideEvents()` | rides-events.service.ts:31 | Timeline of events |
| `getAuditTrail()` | rides-events.service.ts:49 | Admin audit view |

### Booking Lifecycle
| Function | File | Purpose |
|----------|------|---------|
| `createBooking()` | bookings.service.ts:24 | PENDING status |
| `getUserBookings()` | bookings.service.ts | My bookings (passenger) |
| `getDriverBookings()` | bookings.service.ts:325 | My bookings (driver) |
| `updateBookingStatus()` | bookings.service.ts:148 | State transitions |
| `validateSecurityCode()` | bookings.service.ts:352 | Verify 4-digit code |
| `markDriverArrived()` | bookings.service.ts:396 | Driver arrival notice |

### User & Admin
| Function | File | Purpose |
|----------|------|---------|
| `getProfile()` | users.service.ts:17 | User profile detail |
| `updateProfile()` | users.service.ts:26 | Update user info |
| `uploadDocument()` | users.service.ts:38 | KYC file upload |
| `verifyUser()` | users.service.ts | Admin verify documents |

### Messaging
| Function | File | Purpose |
|----------|------|---------|
| `handleConnection()` | messages.gateway.ts:23 | WebSocket client connects |
| `joinConversation()` | messages.gateway.ts:29 | Subscribe to room |
| `sendMessage()` | messages.gateway.ts:38 | Send + broadcast |
| `createMessage()` | messages.service.ts:54 | Store message |
| `markAsRead()` | messages.gateway.ts:57 | Read status |

---

## 📊 Data Model Quick View

### UserRole Enum
```typescript
ADMIN       // Full system access
DRIVER      // Can post/manage rides
PASSENGER   // Can book rides
```
(Users can have multiple roles via `roles[]` array)

### RideStatus Enum
```typescript
ACTIVE       // Accepting bookings
COMPLETED    // Journey finished
CANCELLED    // Cancelled
```

### BookingStatus Enum
```typescript
PENDING                 // Awaiting driver confirmation
CONFIRMED               // Accepted by driver
CODE_SENT               // 4-digit code generated
CODE_VERIFIED           // Passenger validated code
RIDE_IN_PROGRESS        // Journey active
DRIVER_ARRIVED_AT_PICKUP  // Alternate arrival status
COMPLETED               // Journey done
CANCELLED               // Cancelled
```

### Key Models & Relationships
```
User (id, username, email, roles[], role, isAdmin)
  ├── 1:N → Ride (as driver)
  ├── 1:N → Booking (as passenger)
  ├── 1:N → RideTracking (as driver)
  ├── 1:N → RideEvent (as user who triggered)
  └── 1:N → Message (as sender)

Ride (id, driverId, origin, destination, status)
  ├── 1:N → Booking (passengers)
  ├── 1:N → RideTracking (GPS points) ⭐
  ├── 1:N → RideEvent (audit trail) ⭐
  └── 1:1 → RideRoute (polyline, distance, duration)

Booking (id, rideId, passengerId, status, securityCode)
  ├── 1:1 → Payment
  └── 1:1 → LiveLocation (passenger position)

Conversation (id, participant1Id, participant2Id)
  └── 1:N → Message
```

---

## 🛣️ Booking State Flow

```mermaid
PENDING → CONFIRMED → CODE_SENT → CODE_VERIFIED → RIDE_IN_PROGRESS → COMPLETED
            ↓              ↓              ↓              ↓              ↓
         (driver          (auto)      (passenger    (auto when    (driver
          confirms)      on start)    validates)   code OK)     completes)

At ANY stage: → CANCELLED (passenger or driver)
```

---

## 🔌 WebSocket Events Reference

| Event | Direction | Triggers | Response |
|-------|-----------|----------|----------|
| `joinConversation` | C→S | Client joins chat | `{event: 'joined', conversationId}` |
| `leaveConversation` | C→S | Client leaves | `{event: 'left', conversationId}` |
| `sendMessage` | C→S | Send text | Broadcast `newMessage` to room |
| `newMessage` | S→C | Message sent | Receive message object |
| `markAsRead` | C→S | Read conversation | Broadcast `messagesRead` event |

---

## 📡 API Endpoint Categories

**Rides** (11 endpoints): `POST`, `GET`, `PATCH`, `DELETE` /rides + lifecycle
**Bookings** (6 endpoints): `POST`, `GET`, `PUT`, `POST` /bookings + validation
**Tracking** (3 endpoints): `POST`, `GET` /rides/:id/tracking + latest
**Events** (2 endpoints): `GET` /rides/:id/events + history
**Users** (7 endpoints): Profile, documents, verify, photos
**Messages** (WebSocket): 5 event types via Socket.io

---

## 🔒 Security Implementation

✅ JWT authentication on all protected endpoints  
✅ Multi-role authorization with fallback checks  
✅ Security code validation (4-digit, expiry)  
✅ Driver ownership verification (only owner can update tracking)  
✅ Passenger/Driver authorization on bookings  
✅ Admin-only endpoints for user verification  
✅ File upload validation & storage  
✅ Input validation via DTOs + class-validator  

---

## 📈 Performance Considerations

✅ Indexed fields in RideTracking: `rideId`, `driverId`, `timestamp`  
✅ Indexed fields in RideEvent: `rideId`, `userId`, `createdAt`  
✅ Unique constraint on Conversation (participant pair)  
✅ Haversine distance calculation in-memory (not DB)  
✅ WebSocket for real-time (vs polling)  
✅ Pagination on list endpoints (page, limit DTOs)  

---

## 🚀 Development Notes

1. **Deployment Ready**: All core features implemented
2. **TODO**: Admin dashboard UI for user management
3. **TODO**: Payment integration completion
4. **TODO**: Push notifications setup
5. **Enhancement**: WebSocket location broadcast (vs polling)
6. **Testing**: Full test suite in TEST_COMPLETE_FLOW.rest

---

**Version**: 1.0  
**Last Updated**: 19 March 2026  
**Ready**: ✅ For Review & Integration
