# ============================================================
# deploy-ionos.ps1 — Deploiement rapide vers IONOS VPS
# Se lance depuis Windows, sans transferer node_modules
# Usage : .\deploy-ionos.ps1
# ============================================================

param(
    [string]$ServerIP = "82.165.35.28",
    [string]$ServerUser = "root",
    [string]$AppDir = "/var/www/urco-backend",
    [string]$Domain = "",
    [string]$SslEmail = "",
    [bool]$UsePlesk = $true
)

$ProjectDir = "c:\Users\hermane\mano\Urco\urco-backend"
$Archive = "$env:TEMP\urco-backend.tar.gz"
$ScriptDir = "$env:TEMP\urco-scripts"
$AppPort = "3002"
$CorsOrigin = if ([string]::IsNullOrWhiteSpace($Domain)) { "*" } else { "https://$Domain" }
$ShouldRunCertbot = (-not $UsePlesk) -and (-not [string]::IsNullOrWhiteSpace($SslEmail))
$EffectiveSslEmail = $SslEmail

# Helper : ecrit un script bash avec fins de ligne Unix (\n) strictes
function Write-BashScript([string]$Path, [string[]]$Lines) {
    $unix = ($Lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($Path, $unix, [System.Text.Encoding]::ASCII)
}

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Urco Backend - Deploiement IONOS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Serveur : $ServerUser@$ServerIP" -ForegroundColor Gray
Write-Host "  Dossier : $AppDir" -ForegroundColor Gray
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
    Write-Host "  Domaine : $Domain" -ForegroundColor Gray
    if (-not [string]::IsNullOrWhiteSpace($SslEmail)) {
        Write-Host "  SSL email: $SslEmail" -ForegroundColor Gray
    }
    if ($UsePlesk) {
        Write-Host "  Mode : Plesk (Nginx/SSL geres dans Plesk)" -ForegroundColor Gray
    }
}
Write-Host ""

if (-not [string]::IsNullOrWhiteSpace($Domain) -and $ShouldRunCertbot) {
    try {
        $dnsIps = (Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop | Select-Object -ExpandProperty IPAddress)
        if ($dnsIps -contains $ServerIP) {
            Write-Host "  DNS OK: $Domain pointe vers $ServerIP" -ForegroundColor Green
        }
        else {
            $EffectiveSslEmail = ""
            Write-Host "  ATTENTION: $Domain ne pointe pas vers $ServerIP (A: $($dnsIps -join ', '))." -ForegroundColor Yellow
            Write-Host "  Certbot sera ignore pour ce deploiement." -ForegroundColor Yellow
        }
    }
    catch {
        $EffectiveSslEmail = ""
        Write-Host "  ATTENTION: Impossible de verifier DNS pour $Domain. Certbot sera ignore." -ForegroundColor Yellow
    }
    Write-Host ""
}

New-Item -ItemType Directory -Force -Path $ScriptDir | Out-Null

# ─── [1/6] Archive sans node_modules ────────────────────────
Write-Step 1 6 "Creation de l'archive source (sans node_modules)..."

Set-Location $ProjectDir

if (Test-Path $Archive) { Remove-Item $Archive -Force }

tar -czf $Archive `
    --exclude="./node_modules" `
    --exclude="./dist" `
    --exclude="./.git" `
    --exclude="./uploads/*" `
    --exclude="./.env" `
    --exclude="*.tar.gz" `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR : Echec de la creation de l'archive." -ForegroundColor Red
    exit 1
}
$size = [math]::Round((Get-Item $Archive).Length / 1MB, 2)
Write-Host "  Archive creee : $Archive ($size MB)" -ForegroundColor Green

# ─── [2/6] Transfert de l'archive + scripts ─────────────────
Write-Step 2 6 "Ecriture des scripts distants et transfert SCP..."

# Script d'extraction / build (fins de ligne Unix garanties)
Write-BashScript "$ScriptDir\extract.sh" @(
    "#!/bin/bash",
    "set -e",
    "mkdir -p $AppDir",
    "cd $AppDir",
    "echo '--- Extraction des fichiers ---'",
    "tar -xzf /tmp/urco-backend.tar.gz",
    "rm /tmp/urco-backend.tar.gz",
    "echo '--- Installation des dependances (dev inclus pour le build) ---'",
    "npm install",
    "echo '--- Build NestJS ---'",
    "npm run build",
    "echo '--- Generation du client Prisma ---'",
    "npx prisma generate",
    "echo '--- Suppression des devDependencies ---'",
    "npm prune --omit=dev",
    "echo 'Build termine.'"
)

# Script de configuration .env sur le serveur
Write-BashScript "$ScriptDir\setup-env.sh" @(
    "#!/bin/bash",
    "set -e",
    "cd $AppDir",
    "echo '--- Configuration .env ---'",
    "if [ ! -f .env ]; then",
    "  echo 'Fichier .env absent, creation...'",
    "  printf 'PORT=$AppPort\nNODE_ENV=production\nJWT_SECRET=urco-jwt-secret-key-2026-production\nJWT_EXPIRATION=7d\nCORS_ORIGIN=$CorsOrigin\n' > .env",
    "  echo 'Fichier .env cree.'",
    "else",
    "  if grep -q '^PORT=' .env; then",
    "    sed -i 's/^PORT=.*/PORT=$AppPort/' .env",
    "  else",
    "    echo 'PORT=$AppPort' >> .env",
    "  fi",
    "  if grep -q '^CORS_ORIGIN=' .env; then",
    "    sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CorsOrigin|' .env",
    "  else",
    "    echo 'CORS_ORIGIN=$CorsOrigin' >> .env",
    "  fi",
    "  echo 'PORT=$AppPort configure dans .env existant.'",
    "fi",
    "echo '--- Contenu .env (sans secrets) ---'",
    "grep -v 'SECRET\|PASSWORD\|DATABASE_URL' .env || true"
)

# Script de migration
Write-BashScript "$ScriptDir\migrate.sh" @(
    "#!/bin/bash",
    "set -e",
    "export PATH=`$PATH:/usr/local/bin",
    "cd $AppDir",
    "echo '--- Synchronisation schema Prisma (db push) ---'",
    "npx prisma db push --accept-data-loss",
    "echo 'Schema synchronise.'"
)

# Script PM2
Write-BashScript "$ScriptDir\pm2.sh" @(
    "#!/bin/bash",
    "set -e",
    "export PATH=`$PATH:/usr/local/bin",
    "# Installe PM2 si absent",
    "if ! command -v pm2 &> /dev/null; then",
    "  echo '--- Installation de PM2 ---'",
    "  npm install -g pm2",
    "fi",
    "cd $AppDir",
    "if pm2 describe urco-backend > /dev/null 2>&1; then",
    "  pm2 delete urco-backend",
    "fi",
    "if command -v lsof &> /dev/null; then",
    "  EXISTING_PID=`$(lsof -t -i:$AppPort -sTCP:LISTEN || true)",
    '  if [ -n "$EXISTING_PID" ]; then',
    "    echo 'Processus detecte sur le port $AppPort, arrêt...' ",
    "    kill -9 `$EXISTING_PID || true",
    "  fi",
    "fi",
    "PORT=$AppPort pm2 start dist/src/main.js --name urco-backend",
    "echo 'Application demarree sur le port $AppPort.'",
    "pm2 save"
)

if ((-not $UsePlesk) -and (-not [string]::IsNullOrWhiteSpace($Domain))) {
    # Script Nginx + SSL (mode hors Plesk)
    Write-BashScript "$ScriptDir\setup-nginx.sh" @(
        "#!/bin/bash",
        "set -e",
        "DOMAIN=`$1",
        "SSL_EMAIL=`$2",
        "APP_PORT=`$3",
        "echo '--- Installation Nginx et Certbot ---'",
        "apt-get update",
        "apt-get install -y nginx certbot python3-certbot-nginx",
        "echo '--- Configuration Nginx ---'",
        "cat > /etc/nginx/sites-available/urco-backend <<EOF",
        "server {",
        "    listen 80;",
        "    server_name `$DOMAIN;",
        "",
        "    location / {",
        "        proxy_pass http://127.0.0.1:`$APP_PORT;",
        "        proxy_http_version 1.1;",
        "        proxy_set_header Host \`$host;",
        "        proxy_set_header X-Real-IP \`$remote_addr;",
        "        proxy_set_header X-Forwarded-For \`$proxy_add_x_forwarded_for;",
        "        proxy_set_header X-Forwarded-Proto \`$scheme;",
        "        proxy_set_header Upgrade \`$http_upgrade;",
        "        proxy_set_header Connection 'upgrade';",
        "    }",
        "}",
        "EOF",
        "ln -sf /etc/nginx/sites-available/urco-backend /etc/nginx/sites-enabled/urco-backend",
        "rm -f /etc/nginx/sites-enabled/default",
        "nginx -t",
        "systemctl restart nginx",
        'if [ -n "$SSL_EMAIL" ]; then',
        "  echo '--- Configuration SSL Lets Encrypt ---'",
        '  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect',
        "else",
        "  echo 'SSL non configure (aucun email fourni).'",
        "fi"
    )
}

# Transfert de l'archive et des scripts en une seule passe SCP
$filesToTransfer = @(
    "$Archive",
    "$ScriptDir\extract.sh",
    "$ScriptDir\setup-env.sh",
    "$ScriptDir\migrate.sh",
    "$ScriptDir\pm2.sh"
)
if ((-not $UsePlesk) -and (-not [string]::IsNullOrWhiteSpace($Domain))) {
    $filesToTransfer += "$ScriptDir\setup-nginx.sh"
}

scp @filesToTransfer "${ServerUser}@${ServerIP}:/tmp/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR : Echec du transfert SCP." -ForegroundColor Red
    exit 1
}
Write-Host "  Transfert reussi." -ForegroundColor Green

# ─── [3/6] Preparation du repertoire distant ────────────────
Write-Step 3 6 "Preparation du repertoire sur le serveur..."

$remoteScripts = "/tmp/extract.sh /tmp/setup-env.sh /tmp/migrate.sh /tmp/pm2.sh"
if ((-not $UsePlesk) -and (-not [string]::IsNullOrWhiteSpace($Domain))) {
    $remoteScripts += " /tmp/setup-nginx.sh"
}
ssh "${ServerUser}@${ServerIP}" "mkdir -p $AppDir && chmod +x $remoteScripts"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR : Impossible de preparer le serveur." -ForegroundColor Red
    exit 1
}

# ─── [4/6] Extraction + npm install + build ─────────────────
Write-Step 4 6 "Extraction, npm install et build sur le serveur..."

ssh "${ServerUser}@${ServerIP}" "bash /tmp/extract.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR lors de l'extraction ou du build." -ForegroundColor Red
    exit 1
}

# Configuration .env
ssh "${ServerUser}@${ServerIP}" "bash /tmp/setup-env.sh"

# ─── [5/6] Migrations Prisma ────────────────────────────────
Write-Step 5 6 "Application des migrations Prisma..."

ssh "${ServerUser}@${ServerIP}" "bash /tmp/migrate.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ATTENTION : Erreur lors des migrations (verifiez manuellement)." -ForegroundColor Yellow
}

# ─── [6/6] Redemarrage PM2 ──────────────────────────────────
Write-Step 6 6 "Redemarrage de l'application via PM2..."

ssh "${ServerUser}@${ServerIP}" "bash /tmp/pm2.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR lors du redemarrage PM2." -ForegroundColor Red
    exit 1
}

# Configuration domaine + SSL (optionnel)
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
    if (-not $UsePlesk) {
        Write-Step 7 7 "Configuration Nginx pour $Domain..."
        ssh "${ServerUser}@${ServerIP}" "bash /tmp/setup-nginx.sh '$Domain' '$EffectiveSslEmail' '$AppPort'"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERREUR lors de la configuration Nginx/SSL." -ForegroundColor Red
            exit 1
        }
    }
}

# ─── Nettoyage distant ───────────────────────────────────────
if ((-not $UsePlesk) -and (-not [string]::IsNullOrWhiteSpace($Domain))) {
    ssh "${ServerUser}@${ServerIP}" "rm -f /tmp/extract.sh /tmp/setup-env.sh /tmp/migrate.sh /tmp/pm2.sh /tmp/setup-nginx.sh" 2>$null
}
else {
    ssh "${ServerUser}@${ServerIP}" "rm -f /tmp/extract.sh /tmp/setup-env.sh /tmp/migrate.sh /tmp/pm2.sh" 2>$null
}

# ─── Resume ─────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Deploiement termine avec succes !" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
    Write-Host "  API  : https://${Domain}/api/v1" -ForegroundColor Cyan
    Write-Host "  Docs : https://${Domain}/api/docs" -ForegroundColor Cyan
    Write-Host "  Fallback IP : http://${ServerIP}:${AppPort}/api/v1" -ForegroundColor Gray
    if ($UsePlesk) {
        Write-Host ""
        Write-Host "  Plesk - Additional nginx directives :" -ForegroundColor Yellow
        Write-Host "    location / {" -ForegroundColor Gray
        Write-Host "        proxy_pass http://127.0.0.1:$AppPort;" -ForegroundColor Gray
        Write-Host "        proxy_http_version 1.1;" -ForegroundColor Gray
        Write-Host "        proxy_set_header Host `$host;" -ForegroundColor Gray
        Write-Host "        proxy_set_header X-Real-IP `$remote_addr;" -ForegroundColor Gray
        Write-Host "        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;" -ForegroundColor Gray
        Write-Host "        proxy_set_header X-Forwarded-Proto `$scheme;" -ForegroundColor Gray
        Write-Host "        proxy_set_header Upgrade `$http_upgrade;" -ForegroundColor Gray
        Write-Host "        proxy_set_header Connection `"upgrade`";" -ForegroundColor Gray
        Write-Host "        proxy_read_timeout 300s;" -ForegroundColor Gray
        Write-Host "        proxy_send_timeout 300s;" -ForegroundColor Gray
        Write-Host "    }" -ForegroundColor Gray
    }
    if (-not [string]::IsNullOrWhiteSpace($SslEmail) -and [string]::IsNullOrWhiteSpace($EffectiveSslEmail)) {
        Write-Host "  SSL: non active (DNS non pret). Relancer plus tard avec -SslEmail." -ForegroundColor Yellow
    }
}
else {
    Write-Host "  API  : http://${ServerIP}:${AppPort}/api/v1" -ForegroundColor Cyan
    Write-Host "  Docs : http://${ServerIP}:${AppPort}/api/docs" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Commandes utiles sur le serveur :" -ForegroundColor Gray
Write-Host "    pm2 logs urco-backend" -ForegroundColor Gray
Write-Host "    pm2 status" -ForegroundColor Gray
Write-Host ""

# Nettoyage local
Remove-Item $Archive -Force -ErrorAction SilentlyContinue
Remove-Item $ScriptDir -Recurse -Force -ErrorAction SilentlyContinue
