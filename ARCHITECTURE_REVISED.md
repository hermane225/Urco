# Architecture Révisée - Système de Trajets Tracés

## 🎯 Objectif Principal
Créer un système de trajets avec traçabilité complète, où:
- **Chauffeur**: poste un trajet → le fait → le termine → peut en faire un autre
- **Client**: réserve un trajet → reçoit géolocalisation en temps réel → valide le code → termine
- **Admin**: voit la traçabilité complète de tous les trajets

---

## 📊 Changements du Schéma Prisma

### 1. **Ajouter des Enums**
```prisma
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
  PENDING        # Trajet créé, en attente de chauffeur qui démarre
  IN_PROGRESS    # Chauffeur a démarré le trajet
  COMPLETED      # Trajet terminé
  CANCELLED      # Trajet annulé
}
```

### 2. **Améliorer le Model Ride**
```prisma
model Ride {
  id                  String      @id @default(uuid())
  driverId            String
  
  # Localisation
  origin              String
  destination         String
  originLat           Float?
  originLng           Float?
  destLat             Float?
  destLng             Float?
  
  # État détaillé
  state               RideState   @default(PENDING)    # PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  departureDate       DateTime
  departureTime       String
  actualStartTime     DateTime?   # Quand le chauffeur a démarré
  actualEndTime       DateTime?   # Quand le chauffeur a terminé
  
  # Véhicule
  vehicleModel        String
  vehicleColor        String
  vehiclePlate        String
  
  # Prix et places
  pricePerSeat        Float
  availableSeats      Int
  
  # Metadata
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

### 3. **Ajouter Model RideTracking** (géolocalisation en temps réel)
```prisma
model RideTracking {
  id              String    @id @default(uuid())
  rideId          String
  driverId        String
  
  # Localisation en temps réel
  driverLat       Float
  driverLng       Float
  accuracy        Float?      # Precision de la géolocalisation
  heading         Float?      # Direction du véhicule
  speed           Float?      # Vitesse du véhicule
  
  # Metadata
  timestamp       DateTime  @default(now())
  
  ride            Ride      @relation(fields: [rideId], references: [id], onDelete: Cascade)
  driver          User      @relation(fields: [driverId], references: [id], onDelete: Cascade)
  
  @@index([rideId])
  @@index([driverId])
  @@index([timestamp])
}
```

### 4. **Ajouter Model RideEvent** (audit trail)
```prisma
model RideEvent {
  id              String        @id @default(uuid())
  rideId          String
  type            RideEventType
  
  # Le qui a fait l'action (chauffeur, passager, ou système)
  userId          String?
  
  # Details de l'événement
  data            Json?         # Données flexibles selon le type d'événement
  description     String?
  
  createdAt       DateTime      @default(now())
  
  ride            Ride          @relation(fields: [rideId], references: [id], onDelete: Cascade)
  user            User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  @@index([rideId])
  @@index([userId])
  @@index([createdAt])
}
```

### 5. **Améliorer le Model Booking**
```prisma
model Booking {
  id              String        @id @default(uuid())
  rideId          String
  passengerId     String
  
  seats           Int
  totalPrice      Float
  status          BookingStatus @default(PENDING)
  
  # Localisation du passager
  passengerLat    Float?
  passengerLng    Float?
  
  # Code de sécurité
  securityCode    String
  codeExpiry      DateTime?     # Le code expire après X minutes
  codeVerifiedAt  DateTime?     # Quand le code a été vérifié
  
  # Metadata
  message         String?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  ride            Ride          @relation(fields: [rideId], references: [id], onDelete: Cascade)
  passenger       User          @relation(fields: [passengerId], references: [id], onDelete: Cascade)
  payment         Payment?
}
```

### 6. **Améliorer le Model User**
```prisma
model User {
  # ... champs existants ...
  
  # Rôle du moment (dynamique)
  role            UserRole      @default(PASSENGER)  # PASSENGER ou DRIVER
  
  # Traçabilité
  ridesAsDriver   Ride[]        @relation("RidesAsDriver")
  trackingData    RideTracking[]
  rideEvents      RideEvent[]
  bookingsAsPassenger Booking[]
}
```

---

## 🔄 Flux de Trajet Révisé

### **Phase 1: Création du Trajet**
```
1. User poste un trajet (devient DRIVER)
   → Ride est créée avec state = PENDING
   → RideEvent.CREATED

2. Autres users réservent (restent PASSENGER)
   → Booking créée avec status = PENDING
   → Attendent la confirmation
```

### **Phase 2: Démarrage du Trajet**
```
1. Chauffeur clique "Démarrer le trajet"
   → Ride.state = IN_PROGRESS
   → Ride.actualStartTime = now()
   → RideEvent.STARTED_BY_DRIVER
   → Notifier les passagers

2. Système met en place le code de sécurité
   → Booking.securityCode généré (4 chiffres)
   → Booking.codeExpiry = now + 30 minutes (ou X minutes)
   → Booking.status = CODE_SENT
   → RideEvent.PASSENGER_CODE_SENT
   → Notifier le passager avec le code (SMS/push)
```

### **Phase 3: Géolocalisation en Temps Réel**
```
1. WebSocket: Chauffeur envoie sa localisation toutes les N secondes
   → Créer un RideTracking
   → Notifier le passager (WebSocket/push)
   → Afficher sur la carte du passager (live tracking)

2. Chauffeur arrive à la destination
   → Distance < 500m du point de destination
   → Ride.state = COMPLETED ou créer nouvel état DRIVER_ARRIVED
   → RideEvent.DRIVER_ARRIVED
   → Afficher message: "Le chauffeur est arrivé"
```

### **Phase 4: Validation du Code**
```
1. Passager reçoit le chauffeur
   → Chauffeur donne le code au passager
   
2. Passager entre le code dans l'app
   → Vérifier: Booking.securityCode == code fourni
   → Vérifier: code n'a pas expiré
   → Si valide:
      - Booking.status = CODE_VERIFIED
      - Booking.codeVerifiedAt = now()
      - RideEvent.PASSENGER_CODE_VERIFIED
      - Afficher: "Code accepté! Trajet commencé"
   
   → Si invalide:
      - Afficher erreur
      - Notifier chauffeur et admin
```

### **Phase 5: Trajet en Cours**
```
1. Booking.status = RIDE_IN_PROGRESS
   
2. Géolocalisation continue du chauffeur
   → Points de suivi envoyés au passager
   → Admin peut voir également
```

### **Phase 6: Fin du Trajet**
```
1. Chauffeur clique "Terminer le trajet"
   OR système détecte: "Distance < 100m de la destination"
   
2. Mise à jour:
   → Ride.state = COMPLETED
   → Ride.actualEndTime = now()
   → Booking.status = COMPLETED
   → RideEvent.RIDE_COMPLETED
   
3. Post-actions:
   → Générer facture/reçu
   → Demander évaluation (passager → chauffeur, chauffeur → passager)
   → Trajet marqué comme complété dans l'historique
   
4. Chauffeur peut maintenant créer/accepter un autre trajet
```

---

## 📡 Endpoints à Créer/Modifier

### **Rides Controller**
```
POST   /rides                      # Créer un trajet (l'user devient DRIVER)
GET    /rides/:id                  # Détails du trajet
PATCH  /rides/:id/start            # Démarrer le trajet
PATCH  /rides/:id/complete         # Terminer le trajet
GET    /rides/:id/tracking         # Historique de localisation
GET    /rides/:id/events           # Audit trail du trajet
```

### **Bookings Controller**
```
POST   /bookings                   # Réserver un trajet
GET    /bookings/:id               # Détails de la réservation
PATCH  /bookings/:id/verify-code   # Vérifier le code de sécurité
GET    /bookings/:id/status        # Voir l'état en temps réel
```

### **Tracking Controller** (nouveau)
```
POST   /tracking/update-location   # Chauffeur envoie sa localisation
GET    /tracking/:rideId           # Passager voit localisation chauffeur
```

### **Admin Analytics** (nouveau)
```
GET    /admin/rides                # Toutes les trajets avec filtres
GET    /admin/rides/:id/full       # Trajet complet avec tous les événements
GET    /admin/bookings             # Toutes les réservations
GET    /admin/tracking/:rideId     # Historique de géolocalisation
```

---

## 🔐 Système de Code de Sécurité

```
✅ Avantages:
   - Prouve que le passager est présent au moment du trajet
   - Prévient les fraudes (passager qui ne monte pas)
   - Admin peut voir qui a validé le code et quand
   
⏱️ Timing:
   - Code généré: Chauffeur démarre le trajet
   - Code envoyé: SMS/Push au passager
   - Expiration: 30 minutes (configurable)
   - Validation: Passager rentre le code à l'arrivée du chauffeur
   
📝 Audit:
   - RideEvent.PASSENGER_CODE_SENT (timestamp, code expiré)
   - RideEvent.PASSENGER_CODE_VERIFIED (timestamp, user qui a validé)
   - Si code refusé: log la tentative échouée
```

---

## 📊 Dashboard Admin

```
Vue globale:
- Nombre de trajets actifs
- Nombre de réservations en attente
- Trajets terminés aujourd'hui
- Taux de validation du code
- Trajets annulés/problématiques

Détails par trajet:
- Chauffeur: nom, rating, trajets complétés
- Passagers: liste avec status de validation du code
- Localisation: carte de suivi en temps réel
- Timeline: tous les événements du trajet
- Historique: où le chauffeur a été (géolocalisation)

Sécurité:
- Trajets sans code validé (à vérifier)
- Chauffeurs avec nota bene
- Passagers avec problèmes
```

---

## 🛠️ Implémentation par Priorité

### **Priorité 1 (Critique)**
- [ ] Migrer schéma Prisma
- [ ] Ajouter RideTracking et RideEvent
- [ ] Implémenter endpoint `/rides/:id/start`
- [ ] Implémenter endpoint `/bookings/:id/verify-code`
- [ ] Ajouter WebSocket pour géolocalisation

### **Priorité 2 (Important)**
- [ ] Dashboard admin avec traçabilité
- [ ] Historique de localisation
- [ ] Notifications en temps réel
- [ ] Gestion des rôles dynamiques

### **Priorité 3 (Amélioration)**
- [ ] Analytics avancées
- [ ] Rapports de sécurité
- [ ] Système de notation
- [ ] Alertes automatiques

---

## 📝 Notes Techniques

1. **WebSocket**: Utiliser Socket.io (déjà installé?) pour:
   - Géolocalisation en temps réel
   - Notifications push
   - Mises à jour d'état

2. **Géolocalisation**:
   - Front-end: envoyer position toutes les 5-10 secondes
   - Calculer distance avec destination
   - Détecter "arrivée" automatiquement

3. **Code de déroulement**:
   - Générer: `Math.floor(1000 + Math.random() * 9000)`
   - Expirer après X minutes
   - 3-4 tentatives avant blocage?

4. **Audit Trail**:
   - Chaque action = RideEvent
   - Garder les données de localisation (GDPR?)
   - Permettre admin à consulter l'historique
