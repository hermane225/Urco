# TODO: Ajout route notation chauffeur

## Status: ✅ COMPLETED

### Plan:
1. [x] Read users.service.ts & controller
2. [x] Add rateDriver method (users.service.ts)
3. [x] Add POST /users/:driverId/rate endpoint (users.controller.ts)
4. [x] DTO RateDriverDto added
5. [x] Logic: validate completed booking, prevent duplicates via rideEvent, update averageRating/ridesCompleted
6. [x] ✅ COMPLETED

### Rating Logic:
- After ride completion
- Passenger rates driver (1-5 stars)
- Update driver.averageRating, ratingCount
- Only once per ride

Test:
```
# Complete ride, then rate
curl -H "Authorization: Bearer <passenger-token>" -d '{"rideId":"...","rating":5}' POST /users/<driver-id>/rate
