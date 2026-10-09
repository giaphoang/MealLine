# FEED App Deployment Checklist

**Target:** Raspberry Pi 5 + Cloudflare Tunnel  
**Domain:** feed.williamtemple.app  
**Status:** ✅ **PRODUCTION - DEPLOYED AND VERIFIED**  
**Deployment Date:** December 21, 2024

---

> **MILESTONE ACHIEVED**: Docker-based deployment successfully running in production at feed.williamtemple.app. Core functionality verified with external user testing including OTP authentication and AI-powered document translation.

> **DEPLOYMENT METHOD**: This project now uses **Docker** for deployment. See `docs/deployment/DOCKER_DEPLOYMENT.md` for current deployment workflow. The PM2-based instructions below are preserved for reference but Docker is the recommended approach.

---

## Docker Deployment (RECOMMENDED)

For current deployment workflow:
1. See `/docs/deployment/DOCKER_DEPLOYMENT.md`
2. Build multi-arch images on Mac: `./docker-build.sh`
3. Deploy to Pi: `docker compose pull && docker compose up -d`

**Benefits:**
- Build once, deploy anywhere (Mac/Pi)
- Identical dev/prod behavior
- Database-backed encryption (no .env editing)
- Single-domain Cloudflare routing

---

## PM2 Deployment (LEGACY - For Reference)

> Note: This checklist assumes a **PM2-based** deployment. Use Docker method above for new deployments.

## Pre-Deployment Setup

### Hardware Setup
- [ ] Raspberry Pi 5 powered on and accessible
- [ ] Ethernet connected (or WiFi configured)
- [ ] Can SSH into Pi: `ssh pi@feed-pi.local`
- [ ] Hostname set to `feed-pi`

### Account Setup
- [ ] Cloudflare account created
- [ ] williamtemple.app domain added to Cloudflare
- [ ] Namecheap nameservers updated to Cloudflare
- [ ] DNS propagation verified (24-48 hours)
- [ ] Resend account created
- [ ] Resend API key obtained: `re_________________`

### Security Prep
- [ ] JWT secret generated: `openssl rand -base64 64`
- [ ] Copy generated secret: `________________________`
- [ ] SSH key created on Pi
- [ ] SSH key added to GitHub (if using git clone method)

### Pre-Deployment Verification (Backend)
- [ ] Node 24.x / npm 11.x installed: `node -v` / `npm -v`
- [ ] Fresh install with legacy peers: `npm install --legacy-peer-deps` (from repo root)
- [ ] Prisma client generated: `cd packages/backend && npx prisma generate`
- [ ] TypeScript build passes: `npm run build` (from packages/backend)
- [ ] Dist cleaned if needed: `rm -rf packages/backend/dist && npm run build`

---

## Raspberry Pi Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y
sudo reboot

# After reboot
sudo timedatectl set-timezone America/Los_Angeles

# Install essentials
sudo apt install -y curl wget git build-essential

# Install Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v  # v20.x.x
npm -v   # v10.x.x

# Install PM2
sudo npm install -g pm2
pm2 startup systemd -u pi --hp /home/pi
# Run the command it outputs

# Install serve
sudo npm install -g serve

# Create directories
mkdir -p ~/feed ~/backups/feed ~/logs/feed
```

**Checkpoint:** ✓ Pi fully configured

---

## Application Deployment

### Method 1: Git Clone (Recommended)

```bash
cd ~/feed
git clone git@github.com:YOUR_USERNAME/wth_app_clean.git .

# Or with HTTPS:
# git clone https://github.com/YOUR_USERNAME/wth_app_clean.git .

npm install --legacy-peer-deps
cd packages/frontend
npm run build
cd ~/feed
```

**Checkpoint:** ✓ Code deployed and built

---

## Environment Configuration

### Backend .env

```bash
cd ~/feed/packages/backend
nano .env
```

**Paste and customize:**
```bash
NODE_ENV=production
PORT=3001
DATABASE_URL="file:./production.db"

JWT_SECRET="[YOUR_64_CHAR_SECRET]"
JWT_EXPIRES_IN="7d"

RESEND_API_KEY="re_[YOUR_KEY]"
EMAIL_FROM="login@williamtemple.app"

APP_URL="https://feed.williamtemple.app"
COOKIE_DOMAIN=".williamtemple.app"

FORCE_AUTH=true
STORAGE_PATH="./storage"
```

**Save:** Ctrl+O, Enter, Ctrl+X

### Frontend .env

```bash
cd ~/feed/packages/frontend
nano .env
```

**Paste:**
```bash
VITE_API_BASE_URL=https://feed.williamtemple.app
```

**Save:** Ctrl+O, Enter, Ctrl+X

### Secure Files

```bash
chmod 600 ~/feed/packages/backend/.env
chmod 600 ~/feed/packages/frontend/.env
```

**Checkpoint:** ✓ Environment variables configured

---

## Database Setup

```bash
cd ~/feed/packages/backend

# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Verify database created
ls -lh production.db
```

**Checkpoint:** ✓ Database initialized

---

## PM2 Configuration

### Create ecosystem.config.js

```bash
cd ~/feed
nano ecosystem.config.js
```

**Paste:**
```javascript
module.exports = {
  apps: [
    {
      name: 'feed-backend',
      cwd: '/home/pi/feed/packages/backend',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--require ts-node/register',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
      error_file: '/home/pi/logs/feed/backend-error.log',
      out_file: '/home/pi/logs/feed/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'feed-frontend',
      cwd: '/home/pi/feed/packages/frontend',
      script: 'serve',
      args: '-s dist -l 5173',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },
      error_file: '/home/pi/logs/feed/frontend-error.log',
      out_file: '/home/pi/logs/feed/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
```

**Save:** Ctrl+O, Enter, Ctrl+X

### Install ts-node

```bash
cd ~/feed/packages/backend
npm install --save-dev ts-node @types/node
```

### Start Applications

```bash
cd ~/feed
pm2 start ecosystem.config.js
pm2 save
pm2 list
```

**Expected output:**
```
┌─────┬────────────────┬─────────┬─────────┬───────┐
│ id  │ name           │ status  │ restart │ uptime│
├─────┼────────────────┼─────────┼─────────┼───────┤
│ 0   │ feed-backend   │ online  │ 0       │ 5s    │
│ 1   │ feed-frontend  │ online  │ 0       │ 5s    │
└─────┴────────────────┴─────────┴─────────┴───────┘
```

### Verify Health

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok",...}

curl http://localhost:5173
# Should return: HTML content
```

**Checkpoint:** ✓ Applications running locally

---

## Cloudflare Tunnel Setup

### Install cloudflared

```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared-linux-arm64.deb
cloudflared --version
```

### Authenticate

```bash
cloudflared tunnel login
# Opens browser - select williamtemple.app domain
```

### Create Tunnel

```bash
cloudflared tunnel create feed-tunnel
# Save the UUID shown!
```

**Tunnel UUID:** `___________________________________`

### Configure Tunnel

```bash
nano ~/.cloudflared/config.yml
```

**Paste (replace UUID):**
```yaml
tunnel: YOUR-TUNNEL-UUID-HERE
credentials-file: /home/pi/.cloudflared/YOUR-TUNNEL-UUID-HERE.json

ingress:
  - hostname: feed.williamtemple.app
    service: http://localhost:5173
  
  - service: http_status:404
```

**Note:** Update both lines with your actual tunnel UUID!

**Save:** Ctrl+O, Enter, Ctrl+X

### Route DNS

```bash
cloudflared tunnel route dns feed-tunnel feed.williamtemple.app
```

**Expected:**
```
INF Added CNAME feed.williamtemple.app which will route to this tunnel
```

### Test Tunnel

```bash
# Test in foreground
cloudflared tunnel run feed-tunnel
# Keep running...
```

**In new SSH session:**
```bash
# Test from internet (use phone or another device)
# Visit: https://feed.williamtemple.app
# Should see FEED login page!
```

**Stop test:** Ctrl+C in first terminal

### Install as Service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
sudo systemctl status cloudflared
```

**Expected:** `active (running)`

**Checkpoint:** ✓ Tunnel running and site accessible

---

## Backup Configuration

### Create Backup Script

```bash
nano ~/backups/feed/backup-db.sh
```

**Paste:**
```bash
#!/bin/bash
DB_PATH="/home/pi/feed/packages/backend/production.db"
BACKUP_DIR="/home/pi/backups/feed"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/feed_backup_${TIMESTAMP}.db"

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
gzip "$BACKUP_FILE"
find "$BACKUP_DIR" -name "feed_backup_*.db.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}.gz"
```

**Save and make executable:**
```bash
chmod +x ~/backups/feed/backup-db.sh
```

### Schedule Backups

```bash
crontab -e
```

**Add this line:**
```
0 2 * * * /home/pi/backups/feed/backup-db.sh >> /home/pi/logs/feed/backup.log 2>&1
```

**Save:** Ctrl+O, Enter, Ctrl+X

**Test backup:**
```bash
~/backups/feed/backup-db.sh
ls -lh ~/backups/feed/
```

**Checkpoint:** ✓ Backups configured

---

## Final Verification

### System Status
```bash
pm2 list                          # Both apps online?
sudo systemctl status cloudflared  # Tunnel active?
pm2 logs --lines 50               # Any errors?
```

### Website Access
- [ ] Visit https://feed.williamtemple.app from external device
- [ ] Login page loads
- [ ] Can request OTP code
- [ ] OTP email arrives (check spam!)
- [ ] Can verify code and login
- [ ] Dashboard loads
- [ ] Can view food items
- [ ] Can create new food item

### Security Checks
- [ ] HTTPS enforced (green lock in browser)
- [ ] No HTTP access works (should redirect to HTTPS)
- [ ] `.env` files have 600 permissions
- [ ] Domain restriction works (`@williamtemple.org` only)

---

## Post-Deployment

### Monitor for 24 Hours
```bash
# Watch logs
pm2 logs

# Check resource usage
pm2 monit

# System resources
htop
```

### Document Deployment
- [ ] Deployment date: _______________
- [ ] Server IP: _______________
- [ ] Tunnel UUID: _______________
- [ ] Initial issues (if any): _______________

---

## Common Issues & Quick Fixes

**Apps won't start:**
```bash
pm2 logs --err
pm2 restart all
```

**Tunnel not working:**
```bash
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -f
```

**Can't access site:**
```bash
# Check tunnel status
sudo systemctl status cloudflared

# Verify DNS
nslookup feed.williamtemple.app

# Check apps locally
curl http://localhost:3001/health
curl http://localhost:5173
```

**High memory usage:**
```bash
pm2 restart all
```

---

## Maintenance Commands

```bash
# View logs
pm2 logs
pm2 logs feed-backend
pm2 logs feed-frontend

# Restart apps
pm2 restart all

# Check status
pm2 list
pm2 monit

# Update application
cd ~/feed
git pull
npm install --legacy-peer-deps
cd packages/frontend
npm run build
cd ~/feed
pm2 restart all

# Check backups
ls -lh ~/backups/feed/

# Monitor tunnel
sudo journalctl -u cloudflared -f
```

---

## Emergency Contacts

**Cloudflare Support:** https://dash.cloudflare.com/support  
**Resend Support:** support@resend.com  
**Repository Issues:** [GitHub repository URL]

---

**Deployment Status:** 
- [ ] In Progress
- [ ] Complete ✓
- [ ] Verified ✓

**Deployed By:** _______________  
**Date:** _______________  
**Sign-off:** _______________
