# TODO: Code dans chat après validation trajet

## Status: ✅ COMPLETED

### Flow implemented:
1. Client commande (POST /bookings) → booking PENDING
2. Chauffeur valide (PATCH /bookings/:id status=CONFIRMED)
3. Chauffeur démarre trajet (PATCH /rides/:id/start) → **Code auto-envoyé dans chat individuel chauffeur-passager**

### Test manuel:
```
# 1. Créer ride (driver)
curl -H "Authorization: Bearer <driver-token>" -d '{"origin":"Paris","destination":"Lyon",...}' POST /rides

# 2. Booker (passenger)
curl -H "Authorization: Bearer <passenger-token>" -d '{"rideId":"...","seats":1}' POST /bookings

# 3. Confirmer booking (driver)
curl -H "Authorization: Bearer <driver-token>" -d '{"status":"CONFIRMED"}' PATCH /bookings/:id

# 4. Démarrer ride → code auto dans chat
curl -H "Authorization: Bearer <driver-token>" PATCH /rides/:id/start
```

Vérifier messages via WebSocket /messages ou DB.

No further changes needed.
