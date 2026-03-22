# Guide des commandes pour tester/déployer (après fix du script)

## 1. Vérifier CWD
```
pwd
```
Attendu: `c:/Users/hermane/mano/Urco`

## 2. Test parsing (sans déploiement)
```
cd urco-backend
powershell -ExecutionPolicy Bypass -File .\\deploy-ionos.ps1 -?
```
- Succès si aide s'affiche (pas d'erreur parse).

## 3. Déploiement IONOS
```
cd urco-backend
.\\deploy-ionos.ps1 -ServerIP \"82.165.35.28\" -ServerUser \"root\" -Domain \"urco.example.com\" -SslEmail \"admin@urco.com\" -SmtpUser \"noreply@gmail.com\" -SmtpPass \"votre-app-password\"
```
Remplace valeurs. Utilise `-?` pour params complets.

## 4. Sur serveur (SSH root@82.165.35.28)
```
pm2 status
pm2 logs urco-backend --lines 50
curl -I http://localhost:3002/api/health  # ou /api
```

## Params utiles
```
.\\deploy-ionos.ps1 -?
```
- `-UsePlesk $true` si Plesk gère SSL/Nginx.

Script prêt !
