# 🔄 Flux Complet du Trajet - Système Amélioré

## Vue d'Ensemble Simplifiée

```
👤 CHAUFFEUR (User A)              📱 PASSAGER (User B)              👨‍💼 ADMIN
        |                               |                               |
        |                               |                               |
        +---> POST /rides ----------> Ride(PENDING)                     |
        |     (crée trajet)             |                               |
        |                               |                               |
        |                          +--------+                           |
        |                          | User B |                           |
        |                          | réserve|                 GET /admin/rides
        |                          +--------+                 (voit trajet)
        |                               |                               |
    PATCH /rides/:id/start              |                               |
    (démarrer)                          |                               |
        |                               |                               |
    Ride = IN_PROGRESS         SMS: Code "1234"              GET /rides/:id/events
    Code généré ----------->   envoyé au passager             (audit trail)
        |                               |                               |
        |                               |                               |
    POST /tracking/location     Voit chauffeur  <-----  WebSocket (live)
    (envoyer position)          en temps réel   (carte)  GET /tracking
        |                       (toutes les 5s)         |
        |                               |                |
    (répète x50)                        |                |
        |                               |                |
    [Chauffeur arrive]                 |                |
        |                          Entre le code         |
        |                          PATCH /bookings/:id  |
        |                          /verify-code         |
        |                               |                |
        |                          ✅ Code valide  -->  Logged in audit
        |                          Booking = CODE_VERIFIED
        |                               |                |
    PATCH /rides/:id/complete           |                |
    (terminer)                          |                |
        |                               |                |
    Ride = COMPLETED            Booking = COMPLETED    GET /admin/rides/:id
    Events créés                        |               /history
    Trajet fermé             ✅ Trajet terminé!        (Voir timeline)
```

---

## 📊 État du Trajet (State Machine)

```
┌─────────────────────────────────────────────────────────────┐
│                     ÉTAT DU TRAJET                          │
└─────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │   PENDING    │
                         │ (créé)        │
                         └──────┬───────┘
                                │
                                │ user: Chauffeur
                                │ action: startRide()
                                ↓
                         ┌──────────────┐
                         │ IN_PROGRESS  │
                         │ (en cours)    │
                         └──────┬───────┘
                                │
                                │ user: Chauffeur
                                │ action: completeRide()
                                ↓
                         ┌──────────────┐
                         │  COMPLETED   │
                         │ (terminé)    │
                         └──────────────┘

                    ANNULATION POSSIBLE:
                    
        Depuis n'importe quel état:
        user: Chauffeur ou Admin
        action: cancelRide()
        Result: CANCELLED
```

---

## 📋 État de la Réservation (Booking Status)

```
┌─────────────────────────────────────────────────────────────┐
│              ÉTATS DE LA RÉSERVATION                         │
└─────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │ PENDING  │  (en attente de confirmation)
    └────┬─────┘
         │
         │ Chauffeur confirme la réservation
         ↓
    ┌──────────┐
    │CONFIRMED │  (réservée, en attente du code)
    └────┬─────┘
         │
         │ Chauffeur démarre le trajet
         │ → Système génère code de sécurité
         ↓
    ┌──────────┐
    │CODE_SENT │  (code envoyé par SMS/Push)
    └────┬─────┘
         │
         │ Passager entre le code
         │ PATCH /bookings/:id/verify-code
         ↓
    ┌──────────────┐
    │CODE_VERIFIED │  (code validé! trajet commencé)
    └────┬─────────┘
         │
         │ Chauffeur termine le trajet
         ↓
    ┌──────────┐
    │COMPLETED │  ✅ (trajet finalisé)
    └──────────┘

    ANNULATION:
    De n'importe quel état → CANCELLED
```

---

## 🔐 Système de Code de Sécurité

```
┌─────────────────────────────────────────────────────────────┐
│           CYCLE DE VIE DU CODE DE SÉCURITÉ                  │
└─────────────────────────────────────────────────────────────┘

Événement: Chauffeur démarre trajet
├─ Action: Générer code 4 chiffres
│  └─ Valeur: "1234" (aléatoire)
│
├─ Action: Définir expiration
│  └─ Durée: 30 minutes à partir de maintenant
│
├─ Action: Mettre à jour la réservation
│  └─ Booking.status = 'CODE_SENT'
│  └─ Booking.securityCode = '1234'
│  └─ Booking.codeExpiry = 'maintenant + 30 min'
│
└─ Action: Notifier le passager
   └─ SMS/Push: "Votre code: 1234"
   └─ RideEvent.PASSENGER_CODE_SENT créé


Événement: Passager reçoit le chauffeur
├─ Passager entre le code "1234"
├─ Appel: PATCH /bookings/:id/verify-code
├─ Validation:
│  ├─ L'expiration n'est pas dépassée? ✓
│  ├─ Le code correspond? ✓
│  └─ Le status est 'CODE_SENT'? ✓
│
├─ Mise à jour:
│  ├─ Booking.status = 'CODE_VERIFIED'
│  ├─ Booking.codeVerifiedAt = maintenant
│  └─ RideEvent créé: PASSENGER_CODE_VERIFIED
│
└─ Résultat: ✅ Trajet peut continuer
```

---

## 📍 Géolocalisation en Temps Réel

```
┌─────────────────────────────────────────────────────────────┐
│           FLUX D'ACTUALISATION DE LOCALISATION              │
└─────────────────────────────────────────────────────────────┘

Chauffeur (app mobile):
└─ Location service (chaque 5-10 sec)
   └─ POST /tracking/update-location/:rideId
      {
        "driverLat": 14.7167,
        "driverLng": -17.4677,
        "accuracy": 8.5,
        "heading": 270,
        "speed": 45.2
      }
      │
      ├─ Créer RideTracking
      │  └─ Sauvegarder dans DB
      │
      └─ Créer RideEvent
         └─ Type: DRIVER_LOCATION_UPDATED

Passager (app mobile):
└─ WebSocket listener
   └─ Reçoit mise à jour en temps réel
   └─ Affiche sur carte
   └─ Calcule distance jusqu'à destination


Admin (dashboard):
└─ GET /tracking/:rideId/history
   └─ Récupère toutes les localisations
   └─ Affiche route complète du trajet
   └─ Peut exporter le trajet (GPX)
```

---

## 🎯 Flux Complet d'un Trajet (Pas à Pas)

### **1️⃣ CRÉATION (10:00)**
```
Action: User A crée un trajet
POST /rides
{
  "origin": "Dakar",
  "destination": "Saint-Louis",
  "departureTime": "12:00",
  "availableSeats": 3,
  "pricePerSeat": 5000
}

Résultat:
├─ Ride créée
│  └─ state = PENDING
│  └─ createdAt = 10:00
│
└─ RideEvent créée
   └─ type = CREATED
   └─ user = User A
```

### **2️⃣ RÉSERVATION (10:15)**
```
Action: User B réserve le trajet
POST /bookings
{
  "rideId": "ride123",
  "seats": 2,
  "passengerLat": 14.70,
  "passengerLng": -17.47
}

Résultat:
├─ Booking créée
│  └─ status = PENDING
│  └─ seats = 2
│
└─ Admin voit:
   └─ GET /admin/rides
   └─ Trajet PENDING avec 1 réservation
```

### **3️⃣ CONFIRMATION (11:00)**
```
Action: Chauffeur confirme la réservation
(Optionnel si auto-confirmation)
PATCH /bookings/:id
{
  "status": "CONFIRMED"
}

Résultat:
├─ Booking.status = CONFIRMED
└─ En attente du démarrage du trajet
```

### **4️⃣ DÉMARRAGE (11:45)**
```
Action: Chauffeur démarre le trajet
PATCH /rides/:id/start
{
  "driverLat": 14.70,
  "driverLng": -17.47
}

Résultat:
├─ Ride.state = IN_PROGRESS
├─ Ride.actualStartTime = 11:45
│
├─ Booking.status = CODE_SENT
├─ Booking.securityCode = "5847"
├─ Booking.codeExpiry = 12:15
│
├─ SMS envoyé à User B: "Code: 5847"
│
└─ RideEvent créées:
   ├─ STARTED_BY_DRIVER
   └─ PASSENGER_CODE_SENT
```

### **5️⃣ SUIVI EN TEMPS RÉEL (11:50 - 12:10)**
```
Chauffeur: POST /tracking/update-location (toutes les 5 sec)
├─ RideTracking enregistrée
├─ WebSocket de User B reçoit mise à jour
└─ Affiche chauffeur sur la carte

Admin: GET /tracking/ride123/history
├─ Voit toutes les positions depuis 11:45
└─ Peut calculer la route exacte

Événements:
└─ RideEvent.DRIVER_LOCATION_UPDATED (x50 environ)
```

### **6️⃣ VALIDATION DU CODE (12:10)**
```
Action: User B reçoit le chauffeur
PATCH /bookings/:id/verify-code
{
  "code": "5847"
}

Validation:
├─ code == "5847"? ✓
├─ 12:10 < 12:15 (expiration)? ✓
├─ status == "CODE_SENT"? ✓

Résultat:
├─ Booking.status = CODE_VERIFIED
├─ Booking.codeVerifiedAt = 12:10
│
└─ RideEvent créée:
   └─ PASSENGER_CODE_VERIFIED
```

### **7️⃣ FIN DU TRAJET (12:25)**
```
Action: Chauffeur termine le trajet
PATCH /rides/:id/complete

Résultat:
├─ Ride.state = COMPLETED
├─ Ride.actualEndTime = 12:25
│
├─ Booking.status = COMPLETED
│
└─ RideEvent créée:
   └─ RIDE_COMPLETED
```

### **8️⃣ AUDIT COMPLET (Admin)**
```
GET /rides/ride123/events

Résultat (timeline):
├─ 10:00 - CREATED (User A)
├─ 10:15 - [Booking created]
├─ 11:00 - CONFIRMED
├─ 11:45 - STARTED_BY_DRIVER (User A)
├─ 11:45 - PASSENGER_CODE_SENT (User B)
├─ 11:50-12:10 - DRIVER_LOCATION_UPDATED (x50)
├─ 12:10 - PASSENGER_CODE_VERIFIED (User B)
└─ 12:25 - RIDE_COMPLETED (User A)

Disponible également:
├─ GET /rides/ride123/tracking (route complète avec coords)
└─ GET /rides/ride123/stats (statistiques: durée, revenu, etc)
```

---

## 🔍 Vue d'Admin Dashboard

```
┌────────────────────────────────────────────────────────────┐
│                   ADMIN DASHBOARD                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📊 STATISTIQUES                                           │
│  ├─ Trajets actifs: 12                                    │
│  ├─ Codes validés aujourd'hui: 45/48                      │
│  ├─ Révenu ce mois: 1,250,000 XOF                         │
│  └─ Trajets complétés: 127                                │
│                                                            │
│  🚗 TRAJETS EN COURS                                       │
│  ├─ Dakar → Rufisque (User A)                            │
│  │  ├─ 2 passagers confirmés                              │
│  │  ├─ 1 code validé                                      │
│  │  └─ Durée: 25 min                                      │
│  │                                                        │
│  └─ Thies → Kaolack (User C)                             │
│     ├─ 3 passagers confirmés                              │
│     ├─ 2 codes validés                                    │
│     └─ Durée: 15 min                                      │
│                                                            │
│  🔴 ALERTES                                               │
│  ├─ Code non validé après 5 min: Booking#123             │
│  └─ Vitesse élevée détectée: Trajet#456 (120 km/h)       │
│                                                            │
│  📍 TRAÇABILITÉ                                            │
│  Cliquer sur un trajet:                                   │
│  ├─ Route complète (carte)                                │
│  ├─ Timeline d'événements                                 │
│  ├─ Positions GPS (de point à point)                      │
│  ├─ Codes validés/refusés                                 │
│  └─ Évaluation passagers/chauffeur                        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Sécurité & Traçabilité

```
✅ QUI A FAIT QUOI?
└─ RideEvent.userId → Qui
└─ RideEvent.type → Quoi
└─ RideEvent.createdAt → Quand
└─ RideEvent.data → Détails (JSON flexible)

✅ PREUVES:
├─ Code de sécurité validé → Passager était présent
├─ Position GPS → Trajet réel avec coordonnées
├─ Timestamp → Preuve temporelle
└─ RideEvent → Audit trail immuable

✅ FRAUDE DÉTECTÉE:
├─ Passager ne valide pas le code
├─ Positions GPS invraisemblables
├─ Durée de trajet anormale
└─ Multiples tentatives de code

✅ ADMIN PEUT:
├─ Voir tous les trajets
├─ Analyser les plaintes
├─ Identifier les modèles de fraude
├─ Prendre des actions (bloquer, suspendre)
└─ Générer rapports
```

---

## ✨ Améliorations Futures

```
Phase 2 (à venir):
├─ 📱 WebSocket pour notifications temps réel
├─ 💳 Intégration paiement complète
├─ ⭐ Système d'évaluation passager/chauffeur
├─ 🗣️ Chat live entre chauffeur et passager
├─ 🤖 Détection automatique d'arrivée (geofencing)
└─ 📊 Analytics avancés

Phase 3 (long terme):
├─ 🧠 Machine Learning (prédiction trajets populaires)
├─ 🌍 Support multi-villes
├─ 🛡️ Assurance trajets
├─ 📱 App web/mobile complète
└─ 🌐 API publique
```

---

## 📞 Support & Documentation

- **Tech Lead**: Voir ARCHITECTURE_REVISED.md
- **Implémentation**: Voir IMPLEMENTATION_STEPS.md
- **Checklist**: Voir IMPLEMENTATION_CHECKLIST.md
- **API Doc**: À générer avec Swagger/OpenAPI

---

**Créé**: 18 Mars 2026  
**Version**: 1.0  
**Statut**: En implémentation
