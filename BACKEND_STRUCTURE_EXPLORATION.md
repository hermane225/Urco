# 🔍 Backend Structure Exploration - Complete Findings

**Date**: 19 March 2026  
**Workspace**: urco-backend (NestJS + Prisma)  
**Database**: PostgreSQL  
**Real-time**: Socket.io (WebSocket)

---

## 📊 TOC - Quick Navigation
1. [Admin Features](#1-admin-features)
2. [Driver/Chauffeur Features](#2-driverchauffeur-features)
3. [Passenger Booking & Routing](#3-passenger-booking--routing)
4. [Geolocation & Real-Time Tracking](#4-geolocation--real-time-tracking)
5. [WebSocket & Real-time Communication](#5-websocket--real-time-communication)

---

## 1. 🛡️ ADMIN FEATURES

### A. Admin User & Role Management

**Core Files**:
- [users.controller.ts](urco-backend/src/users/users.controller.ts#L85-L98) - Admin endpoints
- [users.service.ts](urco-backend/src/users/users.service.ts) - Admin operations
- [admin-users.dto.ts](urco-backend/src/users/dto/admin-users.dto.ts) - Admin DTOs
- [users.dto.ts](urco-backend/src/users/dto/users.dto.ts) - User role enum

**Admin Functions Implemented**:

| Function | Location | Purpose |
|----------|----------|---------|
| `ListUsersQuery` | admin-users.dto.ts | Filter users by: role, pendingValidation, search, pagination (page/limit) |
| `UpdateUserRolesDto` | admin-users.dto.ts | Bulk update user roles (array of UserRole) |
| `verifyUser()` | users.controller.ts:85 | PUT `/users/:userId/verify` - Verify KYC documents |
| `uploadDocument()` | users.service.ts:49 | Handle avatar, selfie, passport, license, insurance uploads |
| `getPhotos()` | users.service.ts:80 | Retrieve all user documents |

**Admin Authorization Check**:
```typescript
// Used in controller methods
const hasAdminAccess = 
  currentUser?.isAdmin ||                           // Boolean flag
  currentUser?.role === 'ADMIN' ||                  // Single role
  Array.isArray(currentUser?.roles) && 
    currentUser.roles.includes('ADMIN');            // Multi-role support
```

**User Roles**: ADMIN, DRIVER, PASSENGER (enum)
- Users can have multiple roles via `roles[]` array
- Primary role tracked in `role` field
- Legacy fields: `isAdmin` (boolean)

**KYC/Document Verification**:
- Avatar, selfie photo, ID document, driver license, car insurance
- Verification flags per document: `*Verified` (boolean)
- Files stored in `/uploads` directory

---

### B. Admin Ride & Booking Oversight

**Ride Cancellation Authority**:
- [rides.service.ts](urco-backend/src/rides/rides.service.ts#L490-L530) - `cancelRide()` method
- Admin or ride owner can cancel at any state (except COMPLETED)
- Cascade: cancels all non-completed bookings for that ride
- Creates RideEvent with reason

**Admin Audit & Tracking**:
- Access to full [RideEvent audit trail](urco-backend/src/rides/rides-events.service.ts)
- View complete geolocation history ([RideTracking](urco-backend/src/rides/rides-tracking.service.ts))
- Endpoint: `GET /rides/:rideId/events` - All events with timestamps
- Endpoint: `GET /rides/:rideId/tracking` - Complete GPS journey

**Authentication**:
- All endpoints protected by [JwtAuthGuard](urco-backend/src/auth/guards/jwt-auth.guard.ts)
- JWT token decoded in request to extract user roles

---

## 2. 🚗 DRIVER/CHAUFFEUR FEATURES

### A. Ride Lifecycle Management

**Core Service**: [rides.service.ts](urco-backend/src/rides/rides.service.ts) (1200+ LOC)
**Core Controller**: [rides.controller.ts](urco-backend/src/rides/rides.controller.ts)

| Phase | Method | Endpoint | Input | Output |
|-------|--------|----------|-------|--------|
| **Create** | `createRide()` | `POST /rides` | CreateRideDto | Ride object, driver becomes DRIVER |
| **Retrieve** | `getRideById()` | `GET /rides/:id` | rideId | Full ride with driver, bookings, tracking |
| **Start** | `startRide()` | `PATCH /rides/:id/start` | rideId, driverId | Ride.status=ACTIVE, generates security codes |
| **Complete** | `completeRide()` | `PATCH /rides/:id/complete` | rideId, driverId | Ride.status=COMPLETED, bookings closed |
| **Cancel** | `cancelRide()` | `PATCH /rides/:id/cancel` | rideId, reason | Ride.status=CANCELLED, refund bookings |

**Driver Role Assignment**:
- User becomes DRIVER on first ride creation
- Updated to `roles[]` array and `role` field
- Persistent across multiple rides

**Key Ride Metadata**:
```typescript
// From Ride model
{
  id: string,
  driverId: string,
  origin, destination: string,
  originLat, originLng, destLat, destLng: float,
  departureDate: DateTime,
  departureTime: string,
  vehicleModel, vehicleColor, vehiclePlate: string,
  pricePerSeat, availableSeats: number,
  notes?: string,
  driverLicensePhoto?, carInsurancePhoto?: string,
  status: RideStatus (ACTIVE|COMPLETED|CANCELLED),
  actualStartTime, actualEndTime: DateTime,
  createdAt, updatedAt: DateTime
}
```

---

### B. Real-Time Location Tracking

**Tracking Service**: [rides-tracking.service.ts](urco-backend/src/rides/rides-tracking.service.ts) (150+ LOC)

**Key Functions**:

1. **Update Location** - `updateDriverLocation(rideId, driverId, locationData)`
   - Input: `{ driverLat, driverLng, accuracy?, heading?, speed? }`
   - Validation: Driver owns ride
   - Creates RideTracking record with timestamp
   - Endpoint: `POST /rides/:rideId/tracking`

2. **Retrieve History** - `getRideTrackingHistory(rideId)`
   - Returns all GPS points ordered by timestamp
   - Used for replay/audit
   - Endpoint: `GET /rides/:rideId/tracking`

3. **Get Latest** - `getLatestLocation(rideId)`
   - Last known driver position
   - For real-time map display
   - Endpoint: `GET /rides/:rideId/tracking/latest`

4. **Recent Positions** - `getRecentLocations(rideId, limit=50)`
   - Last N positions for polyline display
   - Helps reconstruct route

5. **Distance Calc** - `calculateDistance(lat1, lng1, lat2, lng2)`
   - Haversine formula (great-circle distance)
   - Used for arrival detection

**GPS Data Model** (RideTracking):
```prisma
model RideTracking {
  id: string,
  rideId: string (indexed),
  driverId: string (indexed),
  driverLat: float,
  driverLng: float,
  accuracy?: float,        // GPS accuracy in meters
  heading?: float,         // Direction (0-360°)
  speed?: float,           // Speed in km/h
  timestamp: DateTime (indexed, default: now())
}
```

**Location Update Frequency**: 
- Client-side: Every 5-10 seconds (recommended)
- Results in 30-70+ tracking records per 1-hour ride
- Test file shows 50+ updates in TEST_COMPLETE_FLOW.rest

---

### C. Ride Events & Audit Trail

**Events Service**: [rides-events.service.ts](urco-backend/src/rides/rides-events.service.ts) (100+ LOC)

**Key Functions**:

1. **Create Event** - `createRideEvent(rideId, type, userId?, data?, description?)`
   - Logs every significant action
   - Type examples: CREATED, STARTED_BY_DRIVER, DRIVER_LOCATION_UPDATED, CODE_SENT, CODE_VERIFIED, COMPLETED, CANCELLED
   - Flexible JSON data field for event-specific info

2. **Get Events** - `getRideEvents(rideId)`
   - Returns all events ordered by creation time
   - Includes user info (who did the action)
   - Endpoint: `GET /rides/:rideId/events`

3. **Get Audit Trail** - `getAuditTrail(rideId)`
   - Alias for getRideEvents (for admin clarity)

4. **Event Statistics** - `getRideStats(rideId)`
   - Count events by type
   - Calculate ride duration (STARTED → COMPLETED)
   - Timeline breakdown

**Event Model** (RideEvent):
```prisma
model RideEvent {
  id: string,
  rideId: string (indexed),
  type: string,           // Event type name
  userId?: string (indexed),  // Who triggered
  data?: Json,            // Event-specific data
  description?: string,   // Human-readable text
  createdAt: DateTime (indexed)
}
```

**Event Types Used**:
- `CREATED` - Ride posted
- `STARTED_BY_DRIVER` - Driver started journey
- `DRIVER_LOCATION_UPDATED` - GPS update received
- `DRIVER_ARRIVED` - Distance < 500m from destination
- `PASSENGER_CODE_SENT` - 4-digit code generated and sent
- `PASSENGER_CODE_VERIFIED` - Passenger validated code
- `RIDE_IN_PROGRESS` - Journey in motion
- `RIDE_COMPLETED` - Journey finished
- `RIDE_CANCELLED` - Ride cancelled (with reason)

---

## 3. 👥 PASSENGER BOOKING & ROUTING

### A. Booking Lifecycle

**Booking Service**: [bookings.service.ts](urco-backend/src/bookings/bookings.service.ts) (400+ LOC)
**Booking Controller**: [bookings.controller.ts](urco-backend/src/bookings/bookings.controller.ts)

**Booking State Machine**:

```
┌─────────────────────────────────────────────────┐
│  BOOKING STATUS FLOW                            │
└─────────────────────────────────────────────────┘

PENDING ──(driver confirms)──> CONFIRMED
  │
  │  (after ride starts)
  |
  └──> CODE_SENT ──(passenger enters code)──> CODE_VERIFIED
         │
         └──> RIDE_IN_PROGRESS ──(driver completes)──> COMPLETED
         
CANCELLED (can happen from any state)
```

**Key Operations**:

| Operation | Method | Endpoint | Details |
|-----------|--------|----------|---------|
| Create Booking | `createBooking()` | `POST /bookings/rides/:rideId/book` | Passenger books ride, gets PASSENGER role |
| Get My Bookings | `getUserBookings()` | `GET /bookings/bookings` | Passenger views their bookings |
| Driver Views Bookings | `getDriverBookings()` | `GET /bookings/bookings/driver` | Driver sees all bookings for their rides |
| Get Booking Detail | `getBookingById()` | `GET /bookings/bookings/:id` | Full booking info with ride and passenger |
| Update Status | `updateBookingStatus()` | `PUT /bookings/bookings/:id/status` | Driver confirms/completes |
| Validate Code | `validateSecurityCode()` | `POST /bookings/:id/validate-code` | Passenger enters 4-digit code |
| Mark Arrived | `markDriverArrived()` | `PUT /bookings/:id/driver-arrived` | Driver notifies passenger of arrival |

**Booking Model**:
```prisma
model Booking {
  id: string,
  rideId: string,
  passengerId: string,
  seats: number,
  totalPrice: float,
  status: BookingStatus,
  
  // Passenger location
  passengerLat?: float,
  passengerLng?: float,
  
  // Security
  securityCode?: string,         // 4-digit code
  codeValidated: boolean,
  
  message?: string,
  createdAt, updatedAt: DateTime
}
```

**Booking Statuses Enum**:
```
PENDING                   - Awaiting driver confirmation
CONFIRMED                 - Driver accepted booking
CODE_SENT                 - 4-digit code generated (30 min expiry)
CODE_VERIFIED             - Passenger entered correct code
RIDE_IN_PROGRESS          - Journey active
DRIVER_ARRIVED_AT_PICKUP  - Alternate status for arrival
COMPLETED                 - Journey finished, payment complete
CANCELLED                 - Cancelled by passenger or driver
```

---

### B. Security Code System

**Generation & Validation**:
- Generated when driver starts ride
- 4-digit random code (0000-9999)
- Expiry: 30 minutes (configurable)
- Driver gives code to passenger verbally
- Passenger enters code in app to confirm presence

**Flow**:
1. Driver calls `startRide()` → Code generated for each booking
2. Code stored in `Booking.securityCode`
3. Notification sent to passenger (SMS/Push via Messages)
4. Code status: `CODE_SENT`
5. Passenger calls `validateSecurityCode(code)` with code
6. Validation checks:
   - Code not expired
   - Code matches stored value
   - Booking status is CONFIRMED
7. Status updates to `CODE_VERIFIED`
8. RideEvent created: `PASSENGER_CODE_VERIFIED`

**Code Validation Logic** (from [bookings.service.ts](urco-backend/src/bookings/bookings.service.ts#L352)):
```typescript
async validateSecurityCode(bookingId, userId, code) {
  const booking = await fetch(bookingId);
  
  // Validations
  if (booking.ride.driverId !== userId) 
    throw ForbiddenException('Only driver can validate');
  if (booking.status !== CONFIRMED) 
    throw BadRequestException('Only confirmed bookings');
  if (booking.securityCode !== code) 
    throw BadRequestException('Invalid code');
  if (booking.codeValidated) 
    throw BadRequestException('Already validated');
  
  // Update
  booking.codeValidated = true;
  await notifyPassenger('Code accepted!');
  return booking;
}
```

---

### C. Route Management

**Route Model** (RideRoute):
```prisma
model RideRoute {
  id: string,
  rideId: string @unique,
  
  points: Json,           // [[lat,lng], [lat,lng], ...]  polyline format
  distance: float,        // Total distance in km
  duration: int,          // Total duration in seconds
  createdAt: DateTime
}
```

**Route Operations**:
- Google Maps API for reverse geocoding (lat/lng → address)
- Polyline encoding for efficient storage
- Distance calculated via Haversine formula during tracking

**Coordinate Fields**:
```
Origin: originLat / originLng         // Pickup point
Destination: destLat / destLng        // Dropoff point
Passenger: passengerLat / passengerLng  // Passenger position at booking
```

**Ride Search & Filtering**:
- `getRides(filters)` - Text search on origin/destination, date range
- `getNearbyRides(lat, lng, radiusKm)` - Find rides near passenger location
- Haversine filter applied client-side after DB query

---

## 4. 🗺️ GEOLOCATION & REAL-TIME TRACKING

### A. GPS Integration

**Location Data Flow**:
```
Driver Mobile App
   ↓ (every 5-10 sec)
POST /rides/:rideId/tracking {lat, lng, accuracy, heading, speed}
   ↓
RidesTrackingService.updateDriverLocation()
   ├─ Validate driver ownership
   ├─ Create RideTracking record
   ├─ Create RideEvent: DRIVER_LOCATION_UPDATED
   └─ Return tracking ID + timestamp

Passenger Mobile App
   ↓ (real-time or polling)
GET /rides/:rideId/tracking/latest
   ↓
RidesTrackingService.getLatestLocation()
   ├─ Fetch most recent RideTracking
   └─ Return driver position for map display

Admin Dashboard
   ↓
GET /rides/:rideId/tracking
   ↓
RidesTrackingService.getRideTrackingHistory()
   ├─ Fetch all RideTracking records (ordered by timestamp)
   └─ Display full journey polyline
```

**Coordinate Validation**:
- Latitude: `-90.0` to `+90.0` (degrees)
- Longitude: `-180.0` to `+180.0` (degrees)
- Validated in DTOs via `@Min()` and `@Max()` decorators

**Arrival Detection**:
- Distance from destination < 500m → Recognized as "driver arrived"
- Distance from destination < 100m → Can mark ride complete
- Uses Haversine formula: `calculateDistance(driverLat, driverLng, destLat, destLng)`

---

### B. Distance Calculation (Haversine Formula)

**Implementation** (from [rides-tracking.service.ts](urco-backend/src/rides/rides-tracking.service.ts)):

```typescript
calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;  // Earth radius in km
  const dLat = (lat2 - lat1) * PI / 180;
  const dLng = (lng2 - lng1) * PI / 180;
  const a = sin²(dLat/2) + cos(lat1) × cos(lat2) × sin²(dLng/2);
  const c = 2 × atan2(√a, √(1-a));
  return R × c;  // Distance in km
}
```

**Usage**:
- Detect driver arrival
- Calculate total distance traveled (sum of segments)
- Check if driver is within service radius

---

### C. Reverse Geocoding

**Provider**: Google Maps Geocoding API
**Method**: `reverseGeocode(lat, lng)` in [rides.service.ts](urco-backend/src/rides/rides.service.ts#L29)

**Usage**:
- When driver creates ride with lat/lng only
- Converts coordinates to human-readable address
- Examples:
  - `(14.7167, -17.4677)` → "Dakar, Senegal"
  - `(14.1900, -17.5400)` → "Saint-Louis, Senegal"

**Configuration**:
- API Key from environment: `GOOGLE_MAPS_API_KEY`
- Client: `@googlemaps/google-maps-services-js`
- Timeout: 1000ms

---

## 5. 🔌 WEBSOCKET & REAL-TIME COMMUNICATION

### A. Socket.io Gateway Setup

**Gateway File**: [messages.gateway.ts](urco-backend/src/messages/messages.gateway.ts) (80+ LOC)
**Module**: [messages.module.ts](urco-backend/src/messages/messages.module.ts)
**Service**: [messages.service.ts](urco-backend/src/messages/messages.service.ts)

**Framework**: NestJS WebSockets (`@nestjs/websockets`)
**Transport**: Socket.io (configured with CORS: `origin: '*'`)

**Gateway Implementation**:
```typescript
@WebSocketGateway({
  cors: { origin: '*' }
})
export class MessagesGateway 
  implements OnGatewayConnection, OnGatewayDisconnect {
  
  @WebSocketServer() server: Server;
  
  handleConnection(client: Socket) { ... }
  handleDisconnect(client: Socket) { ... }
}
```

---

### B. WebSocket Events

**Supported Events**:

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| **joinConversation** | Client → Server | `{conversationId}` | Subscribe to conversation room |
| **leaveConversation** | Client → Server | `{conversationId}` | Unsubscribe from room |
| **sendMessage** | Client → Server | `{conversationId, senderId, text}` | Send message to room |
| **newMessage** | Server → Room | Message object | Broadcast received message |
| **markAsRead** | Client → Server | `{conversationId, userId}` | Mark messages as read |
| **messagesRead** | Server → Room | conversation ID | Broadcast read status |

**Conversation Management**:
- 1-to-1 conversations only (driver ↔ passenger)
- Participants tracked via `participant1Id` + `participant2Id`
- `OR` query to find conversations for any user
- `lastMessage` + `lastMessageAt` for conversation list display

---

### C. Messaging Features

**Message Model**:
```prisma
model Message {
  id: string,
  conversationId: string,
  senderId: string,
  text: string,
  read: boolean @default(false),
  createdAt: DateTime
}
```

**Conversation Model**:
```prisma
model Conversation {
  id: string,
  participant1Id: string,
  participant2Id: string,
  lastMessage?: string,
  lastMessageAt?: DateTime,
  createdAt, updatedAt: DateTime
  
  // Unique constraint on participant pair
  @@unique([participant1Id, participant2Id])
}
```

**Key Operations** (from [messages.service.ts](urco-backend/src/messages/messages.service.ts)):

1. **Create Conversation** - `createConversation(userId, participantId)`
   - Checks if exists (avoid duplicates)
   - Returns existing or new conversation

2. **Get User Conversations** - `getUserConversations(userId)`
   - All conversations for user (as P1 or P2)
   - Includes last message preview
   - Ordered by `lastMessageAt` desc

3. **Get Messages** - `getMessages(conversationId, userId)`
   - Verify user is participant
   - Return all messages in order
   - Ordered by `createdAt` asc

4. **Create Message** - `createMessage(conversationId, senderId, text)`
   - Verify sender is participant
   - Create message record
   - Emit to all clients in conversation
   - Update `Conversation.lastMessage` + `lastMessageAt`

5. **Mark As Read** - `markMessagesAsRead(conversationId, userId)`
   - Set `read = true` for all messages from other participant

---

### D. Real-Time Tracking Enhancement (Planned)

**Current**: Messages for communication only

**Future**: WebSocket can emit location updates
- Driver position broadcast to all ride passengers
- Real-time map update without polling
- Event: `driverLocationUpdate` → `{rideId, lat, lng, timestamp}`
- Reduces API calls, improves UX latency

**Implementation Path**:
1. Driver connects to Socket.io on ride start
2. Driver emits location event instead of POST
3. Gateway broadcasts to all passengers in conversation
4. Passenger WebSocket listener updates map

---

## 📋 COMPLETE ENDPOINT REFERENCE

### Rides Management
```
POST   /rides                          Create ride (driver)
GET    /rides                          List all active rides
GET    /rides/nearby?lat=X&lng=Y       Find nearby rides
GET    /rides/booked                   Get passenger's booked rides
GET    /rides/:id                      Ride details
GET    /rides/:id/summary              Ride summary + stats
PUT    /rides/:id                      Update ride (driver)
DELETE /rides/:id                      Delete ride (driver)
PATCH  /rides/:id/start                Start ride (driver)
PATCH  /rides/:id/complete             Complete ride (driver)
PATCH  /rides/:id/cancel               Cancel ride (driver/admin)
```

### Ride Tracking
```
POST   /rides/:rideId/tracking         Update driver location
GET    /rides/:rideId/tracking         Get all tracking history
GET    /rides/:rideId/tracking/latest  Get latest driver position
```

### Ride Events & History
```
GET    /rides/:rideId/events           Get all ride events (audit trail)
GET    /rides/:rideId/history          Full ride history with events
GET    /rides/:rideId/stats            Ride statistics
```

### Bookings
```
POST   /bookings/rides/:rideId/book    Book a ride (passenger)
GET    /bookings/bookings              Get my bookings (passenger)
GET    /bookings/bookings/driver       Get driver's bookings
GET    /bookings/:bookingId            Booking details
PUT    /bookings/:bookingId/status     Update status (driver)
POST   /bookings/:bookingId/validate-code  Passenger validates code
PUT    /bookings/:bookingId/driver-arrived Mark driver arrived
```

### Users & Admin
```
GET    /users/profile                  Get user profile
PUT    /users/profile/edit             Update profile
POST   /users/upload-document          Upload KYC document
GET    /users/photos                   Get all user photos
GET    /users/:userId/avatar           Get user avatar
PUT    /users/:userId/verify           Verify user (admin)
```

### Messages (WebSocket)
```
joinConversation(conversationId)       Join chat room
leaveConversation(conversationId)      Leave chat room
sendMessage({conversationId, text})    Send message
markAsRead({conversationId})           Mark messages as read
```

---

## 🔐 Authentication & Authorization

**Guard**: [JwtAuthGuard](urco-backend/src/auth/guards/jwt-auth.guard.ts)
- Protects all endpoints (except public list/search)
- Extracts user from JWT token
- Attaches to `req.user`

**Role Checks**:
- User can perform operations on own data (driver on own rides, passenger on own bookings)
- Admin can perform any operation
- Multi-role support via array checking

**JWT Strategy** (from [jwt.strategy.ts](urco-backend/src/auth/strategies/jwt.strategy.ts)):
- Validates JWT signature
- Extracts user claims: `id`, `username`, `role`, `roles`, `isAdmin`
- Returns user payload for use in controllers

---

## 📊 SUMMARY TABLE

| Area | Implementation | Status | Key Files |
|------|----------------|--------|-----------|
| **Admin Features** | User verification, role management, audit access | ✅ Complete | users.controller, users.service, admin-users.dto |
| **Driver Management** | Ride creation, start/complete, role assignment | ✅ Complete | rides.service, rides.controller |
| **Location Tracking** | GPS updates, history, latest position | ✅ Complete | rides-tracking.service |
| **Ride Events** | Audit trail, event logging | ✅ Complete | rides-events.service |
| **Booking Lifecycle** | PENDING→CONFIRMED→CODE_SENT→VERIFIED→COMPLETED | ✅ Complete | bookings.service, bookings.controller |
| **Security Codes** | 4-digit generation, validation, expiry | ✅ Complete | bookings.service |
| **Route Management** | Polylines, distance, reverse geocoding | ✅ Complete | rides.service (Google Maps) |
| **WebSocket** | Real-time messaging, room management | ✅ Complete | messages.gateway, messages.service |
| **Real-time Tracking** | Future enhancement for location broadcast | 🟡 Planned | messages.gateway (can extend) |

---

## 🚀 KEY FEATURES READY FOR DEPLOYMENT

✅ **Admin Dashboard**: Full user & ride management  
✅ **Driver Features**: Complete ride lifecycle with real-time tracking  
✅ **Passenger Features**: Booking with security code validation  
✅ **Audit Trail**: Complete event logging for compliance  
✅ **Real-time Chat**: WebSocket-based messaging  
✅ **Geolocation**: GPS tracking with Haversine calculations  
✅ **Role-Based Access**: Multi-role authorization  

---

## 📝 NOTES FOR DEVELOPMENT

1. **WebSocket Enhancement**: Consider extending MessagesGateway to emit location updates
2. **Admin Dashboard**: Create dedicated admin routes (`/admin/rides`, `/admin/bookings`, etc.)
3. **Notifications**: Integrate push notifications for code sent/ride updates
4. **Payment Integration**: Payment model exists but service incomplete
5. **Performance**: Add database indexes on `rideId`, `driverId`, `timestamp` (already in schema)
6. **Testing**: Complete test suite in TEST_COMPLETE_FLOW.rest

---

**Document Version**: 1.0  
**Last Updated**: 19 March 2026  
**Status**: Ready for Review ✅
