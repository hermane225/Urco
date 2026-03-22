# TODO_DEPLOY.md - Déploiement urco-backend sur VPS IONOS

## Statut: EN COURS (Confirmé par user)

### Étape 1: Préparer local ✅ PRÊT
```
cd urco-backend && npm install
```
- Vérifier git status clean (main up-to-date).

### Étape 2: Lancer déploiement principal ⏳
```
cd urco-backend
powershell.exe -ExecutionPolicy Bypass -File deploy-ionos.ps1
```
- Ou avec params: `-ServerIP "82.165.35.28" -ServerUser "root"`
- Attendu: Archive → SCP → npm build → prisma db push → pm2 restart.

### Étape 3: Vérifier VPS (SSH root@82.165.35.28) ⏳
```
pm2 status
pm2 logs urco-backend --lines 50
curl -I http://localhost:3002/api/health
curl http://82.165.35.28:3002/api/docs
```

### Étape 4: Tests API/Rides/WebSocket ⏳
```
# Local ou VPS
curl http://82.165.35.28:3002/api/v1/rides
# WS test: utiliser urco-backend/test/ws-e2e-test.js ou Postman
```

### Étape 5: Optionnel - Domain/SSL/SMTP ⏳
Relancer script avec `-Domain "votre.domain" -SslEmail "admin@email.com" -SmtpUser "user@gmail.com" -SmtpPass "app-pass"`

## Troubleshooting:
- SCP fail: Vérif SSH key/passwordless `ssh-copy-id root@82.165.35.28`.
- Prisma DB: Vérif DATABASE_URL dans /var/www/urco-backend/.env.
- PM2 down: `pm2 start dist/src/main.js --name urco-backend`.
- Logs: `pm2 logs urco-backend -f`.

**Prochaine action: Exécuter Étape 1 maintenant.**

