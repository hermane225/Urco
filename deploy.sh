#!/bin/bash

# Urco Backend Deployment Script for IONOS VPS
# Run as: bash deploy.sh

set -e

echo "=========================================="
echo "  Urco Backend Deployment Script"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="urco_db"
DB_USER="urco_user"
DB_PASS="urco@2026"
APP_DIR="/var/www/urco-backend"
DOMAIN="app.urco.com"
APP_PORT="3002"

echo -e "${YELLOW}Step 1: Updating system...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}Step 2: Installing PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib

echo -e "${YELLOW}Step 3: Starting PostgreSQL...${NC}"
systemctl start postgresql
systemctl enable postgresql

echo -e "${YELLOW}Step 4: Configuring PostgreSQL...${NC}"
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME;\" 2>/dev/null || echo 'Database already exists'"
su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\" 2>/dev/null || echo 'User already exists'"
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;\""
su - postgres -c "psql -d $DB_NAME -c \"GRANT ALL ON SCHEMA public TO $DB_USER;\""

echo -e "${YELLOW}Step 5: Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo -e "${YELLOW}Step 6: Installing PM2...${NC}"
npm install -g pm2

echo -e "${YELLOW}Step 7: Installing Nginx...${NC}"
apt install -y nginx

echo -e "${YELLOW}Step 8: Configuring Firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow ${APP_PORT}/tcp
ufw --force enable

echo -e "${YELLOW}Step 9: Creating app directory...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

echo -e "${YELLOW}Step 10: Copying application files...${NC}"
# If you're running this script locally, use SCP to transfer files first
# scp -r /path/to/urco-backend root@82.165.35.28:/var/www/
# For now, we'll assume the files are already there or will be transferred

echo -e "${YELLOW}Step 11: Creating .env file...${NC}"
cat > $APP_DIR/.env << 'EOF'
# Database - PostgreSQL (Note: @ in password is URL-encoded as %40)
DATABASE_URL="postgresql://urco_user:urco%402026@localhost:5432/urco_db?schema=public"

# JWT Authentication
JWT_SECRET="urco-jwt-secret-key-2026-production"
JWT_EXPIRATION=7d

# Application
PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://api.urco.com
EOF

echo -e "${YELLOW}Step 12: Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}Step 13: Building application...${NC}"
npm run build

echo -e "${YELLOW}Step 14: Generating Prisma client...${NC}"
npx prisma generate

echo -e "${YELLOW}Step 15: Running database migrations...${NC}"
npx prisma migrate deploy

echo -e "${YELLOW}Step 16: Starting application with PM2...${NC}"
PORT=$APP_PORT pm2 start dist/src/main.js --name urco-backend
pm2 save

echo -e "${YELLOW}Step 17: Configuring Nginx reverse proxy...${NC}"
cat > /etc/nginx/sites-available/urco-backend << 'NGINX_EOF'
server {
    listen 80;
    server_name api.urco.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/urco-backend /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

echo ""
echo -e "${GREEN}=========================================="
echo "  Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Application: http://localhost:${APP_PORT}"
echo "API Docs: http://localhost:${APP_PORT}/api/docs"
echo "PM2 Status: pm2 status"
echo "PM2 Logs: pm2 logs urco-backend"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure your domain DNS to point to this server"
echo "2. Install SSL certificate: certbot --nginx -d api.urco.com"
echo "3. Update .env with your email/SMTP/Stripe credentials"
echo ""
