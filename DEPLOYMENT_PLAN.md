# Deployment Plan - Urco Backend to IONOS VPS

## Overview
Deploy NestJS backend with PostgreSQL to IONOS VPS (82.165.35.28) with Plesk on Debian 12.

---

## Step 1: Initial Server Setup (via SSH)

### Connect to VPS
```bash
ssh root@82.165.35.28
```

### Update System
```bash
apt update && apt upgrade -y
```

---

## Step 2: Install PostgreSQL

### Install PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
```

### Start and Enable PostgreSQL
```bash
systemctl start postgresql
systemctl enable postgresql
```

### Create Database and User
```bash
su - postgres
psql
CREATE DATABASE urco_db;
CREATE USER urco_user WITH PASSWORD 'YourStrongPassword123!';
GRANT ALL PRIVILEGES ON DATABASE urco_db TO urco_user;
ALTER DATABASE urco_db OWNER TO urco_user;
\q
exit
```

---

## Step 3: Install Node.js

### Install Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### Verify Installation
```bash
node --version
npm --version
```

---

## Step 4: Install PM2 (Process Manager)

```bash
npm install -g pm2
```

---

## Step 5: Configure Firewall

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # NestJS App
ufw enable
```

---

## Step 6: Prepare Application Files

### Option A: Clone from Git (Recommended)
```bash
cd /var/www
git clone https://github.com/your-repo/urco-backend.git
cd urco-backend
```

### Option B: Transfer via SCP
From your local machine:
```bash
scp -r urco-backend root@82.165.35.28:/var/www/
```

---

## Step 7: Configure Environment Variables

Create `.env` file in `/var/www/urco-backend/`:

```env
# Database
DATABASE_URL="postgresql://urco_user:YourStrongPassword123!@localhost:5432/urco_db?schema=public"

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRATION=7d

# App Config
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://your-domain.com

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password

# Firebase (if needed)
FIREBASE_PROJECT_ID=your-project
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...

# Stripe (if needed)
STRIPE_SECRET_KEY=sk_test_...
```

---

## Step 8: Install Dependencies and Build

```bash
cd /var/www/urco-backend
npm install
npm run build
```

---

## Step 9: Generate Prisma Client and Run Migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

---

## Step 10: Start Application with PM2

```bash
pm2 start dist/main.js --name urco-backend
pm2 save
pm2 startup
```

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs urco-backend   # View logs
pm2 restart urco-backend  # Restart
```

---

## Step 11: Configure Plesk (Optional - for Domain)

### Add Domain in Plesk
1. Log into Plesk: https://82.165.35.28:8443
2. Add domain or subdomain
3. Configure proxy to port 3000

### Or use Nginx as reverse proxy:

```bash
apt install -y nginx

# Create nginx config
nano /etc/nginx/sites-available/urco-backend
```

Configuration:
```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
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
```

```bash
ln -s /etc/nginx/sites-available/urco-backend /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## Step 12: SSL Certificate (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.your-domain.com
```

---

## Quick Reference - Commands Summary

### On Server:
```bash
# Connect
ssh root@82.165.35.28

# Database setup
su - postgres -c "psql -c \"CREATE DATABASE urco_db;\""
su - postgres -c "psql -c \"CREATE USER urco_user WITH PASSWORD 'password';\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE urco_db TO urco_user;\""

# App deployment
cd /var/www/urco-backend
npm install
npm run build
npx prisma generate
npx prisma migrate deploy

# Start with PM2
pm2 start dist/main.js --name urco-backend
pm2 save

# Check status
pm2 status
pm2 logs urco-backend
```

---

## Environment Variables to Configure

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@localhost:5432/db |
| JWT_SECRET | Secret key for JWT | random-string |
| PORT | App port | 3000 |
| CORS_ORIGIN | Allowed origins | https://yourapp.com |
| NODE_ENV | Environment | production |

---

## Troubleshooting

### Check logs
```bash
pm2 logs urco-backend --lines 50
```

### Check if port is in use
```bash
netstat -tulpn | grep 3000
```

### Restart application
```bash
pm2 restart urco-backend
```

### Check PostgreSQL status
```bash
systemctl status postgresql
```

---

## Production Checklist

- [ ] PostgreSQL installed and configured
- [ ] Node.js installed
- [ ] PM2 installed and configured
- [ ] Environment variables set
- [ ] Dependencies installed
- [ ] Application built
- [ ] Database migrated
- [ ] Application started with PM2
- [ ] Firewall configured
- [ ] Domain configured (optional)
- [ ] SSL certificate installed (optional)
- [ ] Logs monitored

