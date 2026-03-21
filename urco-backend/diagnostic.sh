#!/bin/bash
# Diagnostic script for Urco Backend on IONOS VPS
# Run on server: bash diagnostic.sh

echo "=========================================="
echo "  Urco Backend Diagnostic Tool"
echo "=========================================="
echo ""

# Check if PM2 is installed
echo "[1/8] Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "  PM2 not installed!"
else
    echo "  PM2 is installed"
fi

# Check PM2 status
echo ""
echo "[2/8] PM2 Status..."
pm2 status

# Check if the app is listening on port 3002
echo ""
echo "[3/8] Checking port 3002..."
if netstat -tuln | grep -q ":3002 "; then
    echo "  Port 3002 is LISTENING"
else
    echo "  Port 3002 is NOT listening!"
fi

# Check firewall status
echo ""
echo "[4/8] Firewall status (ufw)..."
ufw status 2>/dev/null || echo "  UFW not available or not configured"

# Check if Node process is running
echo ""
echo "[5/8] Node processes..."
ps aux | grep -E "node|nest" | grep -v grep

# Check recent PM2 logs
echo ""
echo "[6/8] PM2 Logs (last 50 lines)..."
pm2 logs urco-backend --lines 50 --nostream

# Test local API
echo ""
echo "[7/8] Testing local API..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3002/api/v1 || echo "  Failed to connect to local API"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3002/api/docs || echo "  Failed to connect to Swagger"

# Check .env file
echo ""
echo "[8/8] Environment file check..."
if [ -f /var/www/urco-backend/.env ]; then
    echo "  .env exists"
    echo "  PORT setting:"
    grep "^PORT=" /var/www/urco-backend/.env || echo "  PORT not set!"
else
    echo "  .env NOT FOUND!"
fi

echo ""
echo "=========================================="
echo "  End of Diagnostic"
echo "=========================================="
