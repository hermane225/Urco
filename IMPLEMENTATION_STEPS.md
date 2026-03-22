# Plan d'Implémentation Détaillé

## 🚀 Étape 1: Mise à Jour du Schema Prisma

### 1.1 Fichier: `urco-backend/prisma/schema.prisma`

**Avant:**
```prisma
enum BookingStatus {
  PENDING
  CONFIRMED
  CANCELLED
  COMPLETED
}

enum RideStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}
```

**Après:**
```prisma
enum BookingStatus {
  PENDING
  CONFIRMED
  CODE_SENT
  CODE_VERIFIED
  RIDE_IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum RideState {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum RideEventType {
  CREATED
  STARTED_BY_DRIVER
  DRIVER_LOCATION_UPDATED
  DRIVER_ARRIVED
  PASSENGER_CODE_SENT
  PASSENGER_CODE_VERIFIED
  RIDE_COMPLETED
  RIDE_CANCELLED
}
```

### 1.2 Mettre à jour Models

**Model Ride:**
```prisma
model Ride {
  id                  String      @id @default(uuid())
  driverId            String
  
  origin              String
  destination         String
  originLat           Float?
  originLng           Float?
  destLat             Float?
  destLng             Float?
  
  state               RideState   @default(PENDING)
  departureDate       DateTime
  departureTime       String
  actualStartTime     DateTime?
  actualEndTime       DateTime?
  
  vehicleModel        String
  vehicleColor        String
  vehiclePlate        String
  
  pricePerSeat        Float
  availableSeats      Int
  
  notes               String?
  driverLicensePhoto  String?
  carInsurancePhoto   String?
  
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  
  driver              User        @relation("RidesAsDriver", fields: [driverId], references: [id], onDelete: Cascade)
  bookings            Booking[]
  trackingEvents      RideTracking[]
  rideEvents          RideEvent[]
}
```

**Model Booking:**
```prisma
model Booking {
  id              String        @id @default(uuid())
  rideId          String
  passengerId     String
  
  seats           Int
  totalPrice      Float
  status          BookingStatus @default(PENDING)
  
  passengerLat    Float?
  passengerLng    Float?
  
  securityCode    String
  codeExpiry      DateTime?
  codeVerifiedAt  DateTime?
  
  message         String?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  ride            Ride          @relation(fields: [rideId], references: [id], onDelete: Cascade)
  passenger       User          @relation(fields: [passengerId], references: [id], onDelete: Cascade)
  payment         Payment?
}
```

**Nouveaux Models:**
```prisma
model RideTracking {
  id              String    @id @default(uuid())
  rideId          String
  driverId        String
  
  driverLat       Float
  driverLng       Float
  accuracy        Float?
  heading         Float?
  speed           Float?
  
  timestamp       DateTime  @default(now())
  
  ride            Ride      @relation(fields: [rideId], references: [id], onDelete: Cascade)
  driver          User      @relation(fields: [driverId], references: [id], onDelete: Cascade)
  
  @@index([rideId])
  @@index([driverId])
  @@index([timestamp])
}

model RideEvent {
  id              String        @id @default(uuid())
  rideId          String
  type            RideEventType
  
  userId          String?
  
  data            Json?
  description     String?
  
  createdAt       DateTime      @default(now())
  
  ride            Ride          @relation(fields: [rideId], references: [id], onDelete: Cascade)
  user            User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  @@index([rideId])
  @@index([userId])
  @@index([createdAt])
}
```

**Model User enhancement:**
```prisma
model User {
  # ...existing fields...
  
  # Add tracking
  trackingData    RideTracking[]
  rideEvents      RideEvent[]
  
  # Update relation
  ridesAsDriver   Ride[]        @relation("RidesAsDriver")
}
```

---

## 🛠️ Étape 2: DTOs et Validations

### 2.1 Fichier: `src/rides/dto/rides.dto.ts`

**Ajouter:**
```typescript
export class StartRideDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  driverLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  driverLng!: number;
}

export class CompleteRideDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  finalLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  finalLng!: number;
}

export class UpdateLocationDto {
  @IsString()
  @IsUUID()
  rideId!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  driverLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  driverLng!: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;
}
```

### 2.2 Fichier: `src/bookings/dto/bookings.dto.ts`

**Ajouter:**
```typescript
export class VerifyCodeDto {
  @IsString()
  @Length(4, 4)
  code!: string;
}
```

---

## 🎯 Étape 3: Services

### 3.1 Créer: `src/rides/rides-tracking.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RidesTrackingService {
  private readonly logger = new Logger(RidesTrackingService.name);

  constructor(private prisma: PrismaService) {}

  // Enregistrer localisation en temps réel
  async updateDriverLocation(
    rideId: string,
    driverId: string,
    locationData: {
      driverLat: number;
      driverLng: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
    },
  ) {
    const riding = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!riding) {
      throw new NotFoundException('Ride not found');
    }

    // Créer entrée de suivi
    const tracking = await this.prisma.rideTracking.create({
      data: {
        rideId,
        driverId,
        driverLat: locationData.driverLat,
        driverLng: locationData.driverLng,
        accuracy: locationData.accuracy,
        heading: locationData.heading,
        speed: locationData.speed,
      },
    });

    // Créer RideEvent
    await this.prisma.rideEvent.create({
      data: {
        rideId,
        type: 'DRIVER_LOCATION_UPDATED',
        userId: driverId,
        data: {
          lat: locationData.driverLat,
          lng: locationData.driverLng,
        },
      },
    });

    return tracking;
  }

  // Récupérer l'historique de localisation
  async getRideTrackingHistory(rideId: string) {
    const trackings = await this.prisma.rideTracking.findMany({
      where: { rideId },
      orderBy: { timestamp: 'asc' },
    });

    return trackings;
  }

  // Récupérer dernière localisation connu
  async getLatestLocation(rideId: string) {
    const latest = await this.prisma.rideTracking.findFirst({
      where: { rideId },
      orderBy: { timestamp: 'desc' },
    });

    return latest;
  }
}
```

### 3.2 Créer: `src/rides/rides-events.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RidesEventsService {
  private readonly logger = new Logger(RidesEventsService.name);

  constructor(private prisma: PrismaService) {}

  // Enregistrer un événement
  async createRideEvent(
    rideId: string,
    type: string,
    userId?: string,
    data?: any,
    description?: string,
  ) {
    return await this.prisma.rideEvent.create({
      data: {
        rideId,
        type,
        userId,
        data,
        description,
      },
    });
  }

  // Récupérer tous les événements d'un trajet
  async getRideEvents(rideId: string) {
    return await this.prisma.rideEvent.findMany({
      where: { rideId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // Récupérer audit trail pour admin
  async getAuditTrail(rideId: string) {
    return this.getRideEvents(rideId);
  }
}
```

### 3.3 Améliorer: `src/rides/rides.service.ts`

**Ajouter méthodes:**
```typescript
// Démarrer un trajet
async startRide(rideId: string, driverId: string, location: { lat: number; lng: number }) {
  // Vérifier le trajet appartient au chauffeur
  const ride = await this.prisma.ride.findUnique({
    where: { id: rideId },
    include: { bookings: true },
  });

  if (!ride) {
    throw new NotFoundException('Ride not found');
  }

  if (ride.driverId !== driverId) {
    throw new ForbiddenException('Only the driver can start this ride');
  }

  if (ride.state !== 'PENDING') {
    throw new BadRequestException('Ride is not in PENDING state');
  }

  // Mettre à jour le trajet
  const updatedRide = await this.prisma.ride.update({
    where: { id: rideId },
    data: {
      state: 'IN_PROGRESS',
      actualStartTime: new Date(),
    },
  });

  // Créer RideEvent
  await this.ridesEventsService.createRideEvent(
    rideId,
    'STARTED_BY_DRIVER',
    driverId,
  );

  // Générer les codes de sécurité pour les réservations
  const bookings = ride.bookings;
  for (const booking of bookings) {
    if (booking.status === 'CONFIRMED') {
      const securityCode = Math.floor(1000 + Math.random() * 9000).toString();
      const codeExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          securityCode,
          codeExpiry,
          status: 'CODE_SENT',
        },
      });

      // Event: code envoyé
      await this.ridesEventsService.createRideEvent(
        rideId,
        'PASSENGER_CODE_SENT',
        booking.passengerId,
        { bookingId: booking.id, code: securityCode },
      );

      // TODO: Envoyer SMS/Push avec le code
    }
  }

  return updatedRide;
}

// Terminer un trajet
async completeRide(rideId: string, driverId: string) {
  const ride = await this.prisma.ride.findUnique({
    where: { id: rideId },
  });

  if (!ride) {
    throw new NotFoundException('Ride not found');
  }

  if (ride.driverId !== driverId) {
    throw new ForbiddenException('Only the driver can complete this ride');
  }

  const completedRide = await this.prisma.ride.update({
    where: { id: rideId },
    data: {
      state: 'COMPLETED',
      actualEndTime: new Date(),
    },
  });

  // Mettre à jour tous les bookings à COMPLETED
  await this.prisma.booking.updateMany({
    where: {
      rideId,
      status: { in: ['CODE_VERIFIED', 'RIDE_IN_PROGRESS'] },
    },
    data: {
      status: 'COMPLETED',
    },
  });

  // Event
  await this.ridesEventsService.createRideEvent(
    rideId,
    'RIDE_COMPLETED',
    driverId,
  );

  return completedRide;
}
```

### 3.4 Améliorer: `src/bookings/bookings.service.ts`

**Ajouter méthode:**
```typescript
async verifySecurityCode(bookingId: string, userId: string, code: string) {
  const booking = await this.prisma.booking.findUnique({
    where: { id: bookingId },
    include: { ride: true },
  });

  if (!booking) {
    throw new NotFoundException('Booking not found');
  }

  // Vérifier le passager
  if (booking.passengerId !== userId) {
    throw new ForbiddenException('Only the passenger can verify the code');
  }

  // Vérifier l'état du booking
  if (booking.status !== 'CODE_SENT') {
    throw new BadRequestException('Code not available for this booking');
  }

  // Vérifier l'expiration du code
  if (booking.codeExpiry && booking.codeExpiry < new Date()) {
    throw new BadRequestException('Security code has expired');
  }

  // Vérifier le code
  if (booking.securityCode !== code) {
    throw new BadRequestException('Invalid security code');
  }

  // Mettre à jour
  const updatedBooking = await this.prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'CODE_VERIFIED',
      codeVerifiedAt: new Date(),
    },
  });

  // Event
  await this.ridesEventsService.createRideEvent(
    booking.rideId,
    'PASSENGER_CODE_VERIFIED',
    userId,
    { bookingId },
  );

  return updatedBooking;
}
```

---

## 🔌 Étape 4: Controllers

### 4.1 Améliorer: `src/rides/rides.controller.ts`

**Ajouter routes:**
```typescript
@Patch(':id/start')
@UseGuards(JwtAuthGuard)
async startRide(
  @Param('id') rideId: string,
  @Request() req: any,
  @Body() startRideDto: StartRideDto,
) {
  return await this.ridesService.startRide(rideId, req.user.id, {
    lat: startRideDto.driverLat,
    lng: startRideDto.driverLng,
  });
}

@Patch(':id/complete')
@UseGuards(JwtAuthGuard)
async completeRide(
  @Param('id') rideId: string,
  @Request() req: any,
) {
  return await this.ridesService.completeRide(rideId, req.user.id);
}

@Get(':id/tracking')
@UseGuards(JwtAuthGuard)
async getRideTracking(
  @Param('id') rideId: string,
) {
  return await this.ridesTrackingService.getRideTrackingHistory(rideId);
}

@Get(':id/events')
@UseGuards(JwtAuthGuard)
async getRideEvents(
  @Param('id') rideId: string,
) {
  return await this.ridesEventsService.getRideEvents(rideId);
}
```

### 4.2 Améliorer: `src/bookings/bookings.controller.ts`

**Ajouter route:**
```typescript
@Patch(':id/verify-code')
@UseGuards(JwtAuthGuard)
async verifyCode(
  @Param('id') bookingId: string,
  @Request() req: any,
  @Body() verifyCodeDto: VerifyCodeDto,
) {
  return await this.bookingsService.verifySecurityCode(
    bookingId,
    req.user.id,
    verifyCodeDto.code,
  );
}
```

### 4.3 Créer: `src/tracking/tracking.controller.ts`

```typescript
import { Controller, Post, UseGuards, Request, Body, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateLocationDto } from '../rides/dto/rides.dto';
import { RidesTrackingService } from '../rides/rides-tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private ridesTrackingService: RidesTrackingService) {}

  @Post('update-location')
  @UseGuards(JwtAuthGuard)
  async updateLocation(
    @Request() req: any,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return await this.ridesTrackingService.updateDriverLocation(
      updateLocationDto.rideId,
      req.user.id,
      {
        driverLat: updateLocationDto.driverLat,
        driverLng: updateLocationDto.driverLng,
        accuracy: updateLocationDto.accuracy,
        heading: updateLocationDto.heading,
        speed: updateLocationDto.speed,
      },
    );
  }

  @Get(':rideId/latest')
  @UseGuards(JwtAuthGuard)
  async getLatestLocation(@Param('rideId') rideId: string) {
    return await this.ridesTrackingService.getLatestLocation(rideId);
  }
}
```

---

## ✅ Checklist d'Implémentation

- [ ] 1. Mettre à jour schema.prisma
- [ ] 2. Exécuter migration: `npx prisma migrate dev --name add_ride_tracking`
- [ ] 3. Créer DTOs
- [ ] 4. Créer RidesTrackingService
- [ ] 5. Créer RidesEventsService
- [ ] 6. Mettre à jour RidesService
- [ ] 7. Mettre à jour BookingsService
- [ ] 8. Mettre à jour RidesController
- [ ] 9. Mettre à jour BookingsController
- [ ] 10. Créer TrackingController
- [ ] 11. Intégrer WebSocket pour temps réel
- [ ] 12. Tester avec Postman
- [ ] 13. Créer AdminController pour traçabilité
- [ ] 14. Ajouter notifications

---

## 📱 Exemple de Flux Complet (Frontend + Backend)

```
1. USER A: Crée trajet "Dakar → Saint-Louis"
   → POST /rides → Ride(state=PENDING)
   
2. USER B: Réserve le trajet
   → POST /bookings → Booking(status=PENDING)
   
3. ADMIN: Voit trajet en attente
   → GET /admin/rides
   
4. USER A: Clique "Démarrer"
   → PATCH /rides/:id/start
   → Ride.state = IN_PROGRESS
   → Booking.status = CODE_SENT
   → USER B reçoit SMS avec code "1234"
   
5. USER A: Envoie géolocalisation toutes les 5s
   → POST /tracking/update-location
   → RideTracking créée
   → USER B voit chauffeur en temps réel sur la carte
   
6. USER A: Arrive à destination
   → Distance < 500m détectée automatiquement
   → Affiche: "Chauffeur arrivé à destination"
   
7. USER B: Entre le code "1234"
   → PATCH /bookings/:id/verify-code
   → Booking.status = CODE_VERIFIED
   → Apparence dans l'app: "Code accepté!"
   
8. USER A: Clique "Terminer trujet"
   → PATCH /rides/:id/complete
   → Ride.state = COMPLETED
   → Booking.status = COMPLETED
   
9. ADMIN: Voit trajet en audit trail
   → GET /rides/:id/events
   → [CREATED, STARTED, LOCATION_UPDATED x50, DRIVER_ARRIVED, CODE_SENT, CODE_VERIFIED, COMPLETED]
```
