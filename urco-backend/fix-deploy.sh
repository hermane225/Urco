#!/bin/bash
# Fix and Redeploy script for Urco Backend on IONOS VPS
# Run on server: bash fix-deploy.sh

set -e

echo "=========================================="
echo "  Urco Backend Fix & Redeploy"
echo "=========================================="
echo ""

APP_DIR="/var/www/urco-backend"
SERVER_IP="82.165.35.28"
APP_PORT="3002"

# ─── Step 1: Check and install Node.js ───
echo "[1/7] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "  Node.js is installed: $(node --version)"
fi

# ─── Step 2: Check and install PM2 ───
echo ""
echo "[2/7] Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "  Installing PM2..."
    npm install -g pm2
else
    echo "  PM2 is installed: $(pm2 --version)"
fi

# ─── Step 3: Check app directory ───
echo ""
echo "[3/7] Checking app directory..."
if [ ! -d "$APP_DIR" ]; then
    echo "  ERROR: App directory not found at $APP_DIR"
    echo "  Please deploy the application first using deploy-ionos.ps1"
    exit 1
else
    echo "  App directory exists"
fi

# ─── Step 4: Install dependencies ───
echo ""
echo "[4/7] Installing dependencies..."
cd $APP_DIR
npm install

# ─── Step 5: Build application ───
echo ""
echo "[5/7] Building application..."
npm run build

# ─── Step 6: Generate Prisma client ───
echo ""
echo "[6/7] Generating Prisma client..."
npx prisma generate

# ─── Step 7: Start application with PM2 ───
echo ""
echo "[7/7] Starting application with PM2..."

# Stop existing instance if running
pm2 delete urco-backend 2>/dev/null || true

# Start application
PORT=$APP_PORT pm2 start dist/src/main.js --name urco-backend
pm2 save

# Wait a moment for startup
sleep 3

# Check status
pm2 status

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "  API Base URL: http://${SERVER_IP}:${APP_PORT}/api/v1"
echo "  API Docs:     http://${SERVER_IP}:${APP_PORT}/api/docs"
echo ""
echo "  Useful commands:"
echo "    pm2 logs urco-backend    - View logs"
echo "    pm2 status               - Check status"
echo "    pm2 restart urco-backend - Restart"
echo ""
