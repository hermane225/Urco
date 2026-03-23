# 🚀 Déploiement VPS Fix Build - TODO

## ✅ [DONE] Local build OK (0 erreurs)

## ⏳ [PENDING] VPS Commands (exécuter SSH root@VPS):
```bash
cd /var/www/urco-backend
git pull origin main
rm -rf node_modules .prisma    # Clean old
npm install
npx prisma generate           # 🔧 FIX PRINCIPAL: Regénère client TS
npx prisma db push --accept-data-loss  # Sync new fields si besoin
npm run build                  # Vérifier 0 erreurs
pm2 restart urco-backend
pm2 save
pm2 status
```

## ⏳ [PENDING] Tests Post-Déploiement:
```bash
curl http://localhost:3002/health  
curl http://localhost:3002/api/docs
pm2 logs urco-backend --lines 50
```

## ✅ [DONE] Après succès:
- Marquer ✅ dans ce TODO  
- Supprimer ce fichier
