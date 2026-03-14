# TODO: Création Module Payments (100% approuvé)

## Plan approuvé ✅
- [x] 0. Plan créé et approuvé par user

## Étapes à compléter :
- [x] 1. Créer `payments.module.ts` ✅
- [x] 2. Créer `payments.controller.ts` ✅
- [x] 3. Créer `payments.service.ts` ✅
- [x] 4. Créer `dto/payments.dto.ts` ✅
- [x] 5. Modifier `app.module.ts` (import) ✅
- [ ] 6. `prisma generate && prisma db push` ⏳
- [ ] 7. Tests API (`curl` endpoints)
- [ ] 8. Déploiement VPS + vérif routes

**Commande test finale :**
```bash
curl -X POST http://localhost:3000/api/v1/payments \\
  -H \"Authorization: Bearer JWT\" \\
  -d '{\"bookingId\":\"uuid-booking\",\"amount\":5000}'
```

