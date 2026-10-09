# FEED App Deployment Guide: Raspberry Pi 5 + Cloudflare Tunnel

**Document Version:** 1.0  
**Date:** December 10, 2025  
**Target:** Raspberry Pi 5 (ARM64) with Cloudflare Tunnel  
**Domain:** feed.williamtemple.app (subdomain of williamtemple.app on Namecheap)

---

> Note: This guide documents a **PM2-based** deployment on the Pi. For a **container-based** Mac → Pi workflow (multi-arch images + Docker Compose, optional Cloudflare Tunnel container), see `docs/deployment/DOCKER_DEPLOYMENT.md`.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Raspberry Pi Setup](#raspberry-pi-setup)
5. [Application Deployment](#application-deployment)
6. [Cloudflare Tunnel Configuration](#cloudflare-tunnel-configuration)
7. [Environment Configuration](#environment-configuration)
8. [Database Management](#database-management)
9. [Monitoring & Logging](#monitoring--logging)
10. [Backup Strategy](#backup-strategy)
11. [Troubleshooting](#troubleshooting)
12. [Rollback Plan](#rollback-plan)

---

## Overview

This guide covers deploying the FEED application to a Raspberry Pi 5 using:
- **PM2** for process management
- **Cloudflare Tunnel** for secure HTTPS access without port forwarding
- **Nginx** as reverse proxy (optional but recommended)
- **SQLite** database with automatic backups
- **Systemd** for auto-start on boot

### Why This Stack?

**PM2 over Docker:**
- Simpler for single-app deployments
- Avoids SQLite ARM compilation issues
- Lower resource overhead
- Faster iteration cycles
- Native performance on Pi 5

**Cloudflare Tunnel over Traditional Port Forwarding:**
- No exposed ports = enhanced security
- Built-in DDoS protection
- Free SSL/TLS certificates
- Works behind NAT/CGNAT
- Zero Trust security model

---

## Prerequisites

### Hardware
- **Raspberry Pi 5** (4GB+ RAM recommended)
- **MicroSD card** (32GB+ Class 10 or better)
- **Power supply** (official 27W USB-C recommended)
- **Ethernet connection** (preferred) or WiFi

### Services & Accounts
- **Namecheap account** with williamtemple.app domain
- **Cloudflare account** (free tier sufficient)
  - Domain migrated to Cloudflare nameservers
- **Resend account** with API key
- **SSH access** to Raspberry Pi

### Local Machine
- SSH client (Terminal on macOS/Linux, PuTTY on Windows)
- Git configured with SSH keys
- Code editor for configuration files

---

## Architecture

### Network Topology

```
Internet
    ↓
Cloudflare Edge Network
    ↓
Cloudflare Tunnel (outbound-only connection)
    ↓
Raspberry Pi 5 (192.168.x.x)
    ↓
┌─────────────────────────────────────┐
│  Nginx (optional reverse proxy)     │
│  Port: 80                            │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  PM2 Process Manager                 │
│  ├─ Backend (Express)  :3001        │
│  └─ Frontend (serve)   :5173        │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  SQLite Database                     │
│  /home/pi/feed/packages/backend/    │
│  production.db                       │
└─────────────────────────────────────┘
```

### File Structure on Pi

```
/home/pi/
├── feed/                           # Application root
│   ├── packages/
│   │   ├── backend/
│   │   │   ├── src/
│   │   │   ├── prisma/
│   │   │   ├── .env               # Backend env vars
│   │   │   ├── production.db      # SQLite database
│   │   │   └── package.json
│   │   └── frontend/
│   │       ├── dist/              # Built React app
│   │       ├── .env               # Frontend env vars
│   │       └── package.json
│   ├── ecosystem.config.js        # PM2 configuration
│   └── package.json
├── backups/                       # Database backups
│   └── feed/
└── logs/                          # Application logs
    └── feed/
```

---

## Raspberry Pi Setup

### Step 1: Flash Raspberry Pi OS

1. **Download Raspberry Pi Imager**: https://www.raspberrypi.com/software/

2. **Flash OS to MicroSD**:
   - Operating System: **Raspberry Pi OS (64-bit)** (recommended for Pi 5)
   - Storage: Select your MicroSD card
   
3. **Configure before writing** (click gear icon):
   ```
   Enable SSH: Yes
   Username: pi
   Password: [YOUR_SECURE_PASSWORD]
   Hostname: feed-pi
   WiFi: [Configure if needed]
   ```

4. **Write and boot**: Insert SD card into Pi 5, connect power

### Step 2: Initial Pi Configuration

**SSH into your Pi**:
```bash
# From your local machine
ssh pi@feed-pi.local
# Or if .local doesn't work:
ssh pi@[PI_IP_ADDRESS]
```

**Update system**:
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

**Set timezone** (after reboot):
```bash
sudo timedatectl set-timezone America/Los_Angeles  # Or your timezone
```

**Install essential tools**:
```bash
sudo apt install -y curl wget git build-essential
```

### Step 3: Install Node.js

Install Node.js v20.x (LTS as of December 2025):

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node -v   # Should show v20.x.x
npm -v    # Should show v10.x.x
```

### Step 4: Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version

# Configure PM2 to start on boot
pm2 startup systemd -u pi --hp /home/pi
# Run the command it outputs (starts with 'sudo env PATH=...')
```

### Step 5: Create Application Directory

```bash
# Create app directory
mkdir -p ~/feed
cd ~/feed

# Create backup and log directories
mkdir -p ~/backups/feed
mkdir -p ~/logs/feed
```

---

## Application Deployment

### Option A: Git Clone (Recommended)

**Step 1: Set up SSH key on Pi** (if not already done):

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "pi@feed-pi"

# Display public key
cat ~/.ssh/id_ed25519.pub

# Copy this key to your GitHub repository settings:
# GitHub → Settings → Deploy keys → Add deploy key
```

**Step 2: Clone repository**:

```bash
cd ~/feed

# Clone your repository
git clone git@github.com:YOUR_USERNAME/wth_app_clean.git .

# Or if using HTTPS:
# git clone https://github.com/YOUR_USERNAME/wth_app_clean.git .
```

**Step 3: Install dependencies**:

```bash
# Install all dependencies from root
npm install --legacy-peer-deps

# Or install individually
cd packages/backend
npm install --legacy-peer-deps

cd ../frontend
npm install --legacy-peer-deps
```

**Step 4: Build production assets**:

```bash
cd ~/feed

# Build frontend
cd packages/frontend
npm run build  # Creates dist/ directory

cd ~/feed
```

### Option B: Manual Transfer via SCP

If you prefer to build locally and transfer:

```bash
# From your local machine
# Build locally first
cd /Users/russbook/wth_app_clean
npm run build  # If you have a root build script

# Transfer to Pi
scp -r packages/backend pi@feed-pi.local:~/feed/packages/
scp -r packages/frontend/dist pi@feed-pi.local:~/feed/packages/frontend/
scp -r node_modules pi@feed-pi.local:~/feed/
scp package*.json pi@feed-pi.local:~/feed/
```

---

## Cloudflare Tunnel Configuration

### Step 1: Install cloudflared on Pi

```bash
# Download ARM64 version for Pi 5
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb

# Install
sudo dpkg -i cloudflared-linux-arm64.deb

# Verify installation
cloudflared --version
```

### Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser window. Select **williamtemple.app** domain.

Credentials saved to: `~/.cloudflared/cert.pem`

### Step 3: Create Tunnel

```bash
# Create tunnel named 'feed-tunnel'
cloudflared tunnel create feed-tunnel
```

Output shows:
```
Tunnel credentials written to /home/pi/.cloudflared/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.json
```

**Save this UUID** - you'll need it for configuration!

### Step 4: Create Tunnel Configuration

Create config file:

```bash
nano ~/.cloudflared/config.yml
```

Add this configuration:

```yaml
tunnel: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX  # Your tunnel UUID
credentials-file: /home/pi/.cloudflared/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.json

ingress:
  # Route feed.williamtemple.app to frontend
  - hostname: feed.williamtemple.app
    service: http://localhost:5173
  
  # Route api.feed.williamtemple.app to backend (optional separate subdomain)
  - hostname: api.feed.williamtemple.app
    service: http://localhost:3001
  
  # Catch-all rule (required)
  - service: http_status:404
```

**Note**: If you prefer single domain with path-based routing, use Nginx instead (see Nginx section).

**Save and exit** (Ctrl+O, Enter, Ctrl+X)

### Step 5: Route DNS to Tunnel

```bash
# Route main subdomain
cloudflared tunnel route dns feed-tunnel feed.williamtemple.app

# If using separate API subdomain:
cloudflared tunnel route dns feed-tunnel api.feed.williamtemple.app
```

You should see:
```
INF Added CNAME feed.williamtemple.app which will route to this tunnel tunnelID=...
```

### Step 6: Test Tunnel

```bash
# Run tunnel in foreground (for testing)
cloudflared tunnel run feed-tunnel
```

Keep this terminal open. In a new SSH session, verify:

```bash
curl http://localhost:5173  # Should respond
curl http://localhost:3001/health  # Should respond
```

**Stop tunnel**: Press Ctrl+C

### Step 7: Install Tunnel as Service

```bash
# Install as systemd service
sudo cloudflared service install

# Start the service
sudo systemctl start cloudflared

# Enable auto-start on boot
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

You should see: `active (running)`

---

## Environment Configuration

### Backend Environment Variables

Create production environment file:

```bash
cd ~/feed/packages/backend
nano .env
```

Add these variables:

```bash
# ===================================
# PRODUCTION ENVIRONMENT
# ===================================
NODE_ENV=production
PORT=3001

# ===================================
# DATABASE
# ===================================
DATABASE_URL="file:./production.db"

# ===================================
# AUTHENTICATION
# ===================================

# JWT Secret (MUST be unique - generate with: openssl rand -base64 64)
JWT_SECRET="GENERATE_A_NEW_SECRET_HERE"
JWT_EXPIRES_IN="7d"

# Resend Email Service
RESEND_API_KEY="re_YOUR_ACTUAL_RESEND_KEY"
EMAIL_FROM="login@williamtemple.app"

# Application URLs
APP_URL="https://feed.williamtemple.app"
COOKIE_DOMAIN=".williamtemple.app"

# Force authentication
FORCE_AUTH=true

# ===================================
# STORAGE
# ===================================
STORAGE_PATH="./storage"

# ===================================
# AI CONFIGURATION
# ===================================
# Managed in the database via Tools → AI Configuration
# No AI API keys are required in this file
```

**IMPORTANT**: Generate a unique JWT secret:

```bash
# Generate on Pi
openssl rand -base64 64
```

Copy the output and paste it as JWT_SECRET value.

**Save and exit** (Ctrl+O, Enter, Ctrl+X)

### Frontend Environment Variables

Create production environment file:

```bash
cd ~/feed/packages/frontend
nano .env
```

Add:

```bash
# Backend API URL (for Cloudflare tunnel)
VITE_API_BASE_URL=https://feed.williamtemple.app
```

**Note**: If using separate API subdomain:
```bash
VITE_API_BASE_URL=https://api.feed.williamtemple.app
```

**Save and exit**

### Secure Environment Files

```bash
# Restrict access to .env files
chmod 600 ~/feed/packages/backend/.env
chmod 600 ~/feed/packages/frontend/.env
```

---

## Database Management

### Step 1: Initialize Production Database

```bash
cd ~/feed/packages/backend

# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Verify database created
ls -lh production.db  # Should exist and be ~1-2MB
```

### Step 2: Seed Initial Data (Optional)

If you have seed data:

```bash
# Run seed script
npm run seed

# Or if using TypeScript:
npx ts-node scripts/generate-test-data.ts
```

If you deployed via Docker, run the seed job in a one-off container instead:

```bash
cd ~/feed
docker compose --profile seed run --rm seed
```

### Step 3: Database Backup Configuration

Create backup script:

```bash
nano ~/backups/feed/backup-db.sh
```

Add this script:

```bash
#!/bin/bash

# FEED Database Backup Script
# Runs daily via cron

DB_PATH="/home/pi/feed/packages/backend/production.db"
BACKUP_DIR="/home/pi/backups/feed"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/feed_backup_${TIMESTAMP}.db"

# Create backup
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Compress backup
gzip "$BACKUP_FILE"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "feed_backup_*.db.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}.gz"
```

Make executable:

```bash
chmod +x ~/backups/feed/backup-db.sh
```

Add to crontab:

```bash
crontab -e
```

Add this line (runs daily at 2 AM):

```
0 2 * * * /home/pi/backups/feed/backup-db.sh >> /home/pi/logs/feed/backup.log 2>&1
```

**Save and exit**

---

## PM2 Configuration

### Create PM2 Ecosystem File

```bash
cd ~/feed
nano ecosystem.config.js
```

Add this configuration:

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
      env: {
        NODE_ENV: 'production'
      },
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
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/home/pi/logs/feed/frontend-error.log',
      out_file: '/home/pi/logs/feed/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
```

**Save and exit**

### Install Required PM2 Dependencies

```bash
# Install serve globally for frontend
sudo npm install -g serve

# Install ts-node for backend
cd ~/feed/packages/backend
npm install --save-dev ts-node @types/node
```

### Start Applications with PM2

```bash
cd ~/feed

# Start both apps
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Verify apps running
pm2 list
```

You should see:

```
┌─────┬────────────────┬─────────┬─────────┬───────┬────────┬──────────┐
│ id  │ name           │ status  │ restart │ uptime│ cpu    │ memory   │
├─────┼────────────────┼─────────┼─────────┼───────┼────────┼──────────┤
│ 0   │ feed-backend   │ online  │ 0       │ 5s    │ 2%     │ 45.2mb   │
│ 1   │ feed-frontend  │ online  │ 0       │ 5s    │ 1%     │ 28.8mb   │
└─────┴────────────────┴─────────┴─────────┴───────┴────────┴──────────┘
```

### Verify Application Health

```bash
# Test backend health endpoint
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"..."}

# Test frontend
curl http://localhost:5173
# Should return HTML content

# Check PM2 logs
pm2 logs --lines 50
```

---

## Monitoring & Logging

### PM2 Monitoring Commands

```bash
# Real-time monitoring dashboard
pm2 monit

# View logs
pm2 logs
pm2 logs feed-backend
pm2 logs feed-frontend

# View last 100 lines
pm2 logs --lines 100

# Flush logs
pm2 flush

# Restart apps
pm2 restart all
pm2 restart feed-backend
pm2 restart feed-frontend

# Stop apps
pm2 stop all

# Delete apps from PM2
pm2 delete all
```

### System Resource Monitoring

```bash
# CPU and memory usage
htop

# Disk usage
df -h

# Check SQLite database size
du -sh ~/feed/packages/backend/production.db

# Check log sizes
du -sh ~/logs/feed/
```

### Log Rotation Setup

Create logrotate configuration:

```bash
sudo nano /etc/logrotate.d/feed
```

Add:

```
/home/pi/logs/feed/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

**Save and exit**

---

## Backup Strategy

### Automated Backups

1. **Database backups**: Daily at 2 AM (configured in crontab above)
2. **Retention**: 7 days
3. **Storage location**: `/home/pi/backups/feed/`
4. **Format**: Compressed SQLite files (`.db.gz`)

### Manual Backup

```bash
# Create manual backup
cd ~/backups/feed
./backup-db.sh

# Verify backup
ls -lh *.db.gz
```

### Restore from Backup

```bash
# Stop applications
pm2 stop all

# Navigate to backup directory
cd ~/backups/feed

# Decompress backup
gunzip feed_backup_YYYYMMDD_HHMMSS.db.gz

# Restore database
cp feed_backup_YYYYMMDD_HHMMSS.db ~/feed/packages/backend/production.db

# Restart applications
pm2 restart all

# Verify
curl http://localhost:3001/health
```

### Off-site Backup (Recommended)

Set up weekly backups to cloud storage:

```bash
# Install rclone for cloud backup
sudo apt install rclone

# Configure rclone (follow prompts)
rclone config

# Create weekly backup script
nano ~/backups/feed/cloud-backup.sh
```

Add:

```bash
#!/bin/bash

# Weekly cloud backup script
cd /home/pi/backups/feed
latest_backup=$(ls -t feed_backup_*.db.gz | head -1)

if [ -n "$latest_backup" ]; then
    rclone copy "$latest_backup" remote:feed-backups/
    echo "Cloud backup completed: $latest_backup"
fi
```

Add to crontab (runs Sundays at 3 AM):

```
0 3 * * 0 /home/pi/backups/feed/cloud-backup.sh >> /home/pi/logs/feed/cloud-backup.log 2>&1
```

---

## Troubleshooting

### Application Won't Start

**Check PM2 status**:
```bash
pm2 list
pm2 logs --err
```

**Common issues**:

1. **Port already in use**:
```bash
# Check what's using the port
sudo lsof -i :3001
sudo lsof -i :5173

# Kill process if needed
sudo kill -9 <PID>
```

2. **Missing dependencies**:
```bash
cd ~/feed/packages/backend
npm install --legacy-peer-deps

cd ~/feed/packages/frontend
npm install --legacy-peer-deps
```

3. **Database locked**:
```bash
# Check for stale processes
ps aux | grep node

# Restart PM2
pm2 restart all
```

### Cloudflare Tunnel Issues

**Check tunnel status**:
```bash
sudo systemctl status cloudflared
```

**View tunnel logs**:
```bash
sudo journalctl -u cloudflared -f
```

**Restart tunnel**:
```bash
sudo systemctl restart cloudflared
```

**Test local connectivity**:
```bash
curl http://localhost:3001/health
curl http://localhost:5173
```

### Cannot Access Site

1. **Verify DNS propagation**:
```bash
nslookup feed.williamtemple.app
# Should show Cloudflare CNAME
```

2. **Check Cloudflare Dashboard**:
   - Visit https://dash.cloudflare.com
   - Go to Zero Trust → Access → Tunnels
   - Verify tunnel is "Healthy"

3. **Test from different network**:
   - Try accessing from phone (cellular data)
   - Clear browser cache
   - Try incognito/private window

### Database Corruption

**Check database integrity**:
```bash
cd ~/feed/packages/backend
sqlite3 production.db "PRAGMA integrity_check;"
```

If corrupted:

```bash
# Stop apps
pm2 stop all

# Restore from backup (see Backup Strategy section)

# Restart
pm2 restart all
```

### High Memory Usage

**Check resource usage**:
```bash
pm2 monit
htop
```

**Restart if needed**:
```bash
pm2 restart all
```

**Configure memory limits** in `ecosystem.config.js`:
```javascript
max_memory_restart: '500M',  // Adjust as needed
```

---

## Rollback Plan

### Quick Rollback to Previous Version

**Step 1: Keep previous version**

Before deploying new version:

```bash
cd ~/feed
git tag production-$(date +%Y%m%d)
git push --tags
```

**Step 2: Rollback procedure**

```bash
# Stop applications
pm2 stop all

# Restore previous version
cd ~/feed
git fetch --all
git checkout production-YYYYMMDD  # Previous tag
npm install --legacy-peer-deps

# Rebuild frontend
cd packages/frontend
npm run build

# Restart
cd ~/feed
pm2 restart all

# Verify
curl http://localhost:3001/health
```

### Emergency Stop

```bash
# Stop all apps immediately
pm2 stop all

# Disable Cloudflare tunnel temporarily
sudo systemctl stop cloudflared

# Apps are now offline but still on disk
# Investigate issue before restarting
```

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] Pi 5 configured with latest OS
- [ ] Node.js v20.x installed
- [ ] PM2 installed and configured for startup
- [ ] Cloudflare tunnel authenticated
- [ ] Domain DNS migrated to Cloudflare
- [ ] Resend API key obtained
- [ ] JWT secret generated (64+ characters)

### Deployment Steps

- [ ] Application code deployed to Pi
- [ ] Dependencies installed (`npm install --legacy-peer-deps`)
- [ ] Frontend built (`npm run build`)
- [ ] Environment variables configured (`.env` files)
- [ ] Database migrated (`npx prisma migrate deploy`)
- [ ] PM2 ecosystem file created
- [ ] Applications started with PM2
- [ ] PM2 startup configured
- [ ] Cloudflare tunnel configured (`config.yml`)
- [ ] DNS routes created
- [ ] Tunnel service enabled and started

### Post-Deployment Verification

- [ ] Health endpoints responding locally
- [ ] Site accessible via https://feed.williamtemple.app
- [ ] Authentication flow working (Magic Link + OTP)
- [ ] Can create/view food items
- [ ] Database operations successful
- [ ] PM2 processes stable (no restarts)
- [ ] Logs show no errors
- [ ] Cloudflare tunnel status "Healthy"
- [ ] Backup cron job scheduled
- [ ] Monitoring configured

### Security Verification

- [ ] `.env` files have correct permissions (600)
- [ ] No sensitive data in logs
- [ ] HTTPS enforced (via Cloudflare)
- [ ] JWT secret is unique and strong
- [ ] Domain restricted to `@williamtemple.org`
- [ ] Rate limiting configured
- [ ] Firewall rules configured (if needed)

---

## Maintenance

### Weekly Tasks

- [ ] Check PM2 status: `pm2 list`
- [ ] Review application logs: `pm2 logs --lines 100`
- [ ] Check disk usage: `df -h`
- [ ] Verify backup completed: `ls -lh ~/backups/feed/`

### Monthly Tasks

- [ ] Update system packages: `sudo apt update && sudo apt upgrade`
- [ ] Update Node.js packages: `npm outdated` then selective updates
- [ ] Review log sizes: `du -sh ~/logs/feed/`
- [ ] Test backup restoration
- [ ] Review Cloudflare analytics
- [ ] Check for application updates

### Updating Application

```bash
# Pull latest changes
cd ~/feed
git pull origin main

# Install any new dependencies
npm install --legacy-peer-deps

# Apply database migrations
cd packages/backend
npx prisma migrate deploy
npx prisma generate

# Rebuild frontend
cd ../frontend
npm run build

# Restart applications
cd ~/feed
pm2 restart all

# Verify
curl http://localhost:3001/health
pm2 logs --lines 50
```

---

## Appendix A: Nginx Reverse Proxy (Optional)

If you prefer path-based routing on a single domain instead of subdomain routing:

### Install Nginx

```bash
sudo apt install nginx
```

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/feed
```

Add:

```nginx
server {
    listen 80;
    server_name localhost;

    # Frontend (root path)
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API (under /api path)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/feed /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Update Cloudflare config to use Nginx:

```yaml
ingress:
  - hostname: feed.williamtemple.app
    service: http://localhost:80
  - service: http_status:404
```

---

## Appendix B: Cloudflare DNS Configuration

### In Namecheap

1. Go to Domain List → williamtemple.app → Manage
2. Nameservers → Custom DNS
3. Add Cloudflare nameservers (provided when you add domain to Cloudflare):
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```

### In Cloudflare

1. Add domain: williamtemple.app
2. Wait for nameserver verification (~24 hours max)
3. DNS records are automatically created by `cloudflared tunnel route dns` commands
4. Verify CNAME record exists:
   - Type: CNAME
   - Name: feed
   - Target: [UUID].cfargotunnel.com
   - Proxy status: Proxied (orange cloud)

---

## Appendix C: Performance Tuning

### PM2 Cluster Mode (Optional)

For better performance under load:

```javascript
// ecosystem.config.js
{
  name: 'feed-backend',
  script: 'src/index.ts',
  instances: 2,  // Or 'max' for all CPU cores
  exec_mode: 'cluster',
  // ... rest of config
}
```

**Note**: SQLite doesn't handle concurrent writes well. Cluster mode mainly helps with read-heavy workloads.

### Swap Configuration

If experiencing memory issues:

```bash
# Create 2GB swap file
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Appendix D: Quick Command Reference

```bash
# PM2 Commands
pm2 start ecosystem.config.js
pm2 restart all
pm2 stop all
pm2 logs
pm2 monit
pm2 save
pm2 list

# Cloudflare Tunnel
sudo systemctl status cloudflared
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -f
cloudflared tunnel list

# Application Health
curl http://localhost:3001/health
curl http://localhost:5173

# Database Operations
cd ~/feed/packages/backend
npx prisma migrate deploy
npx prisma studio  # Database GUI

# Backups
~/backups/feed/backup-db.sh
ls -lh ~/backups/feed/

# Logs
pm2 logs --lines 100
tail -f ~/logs/feed/backend-error.log
sudo journalctl -u cloudflared -n 100

# System Resources
htop
df -h
free -h
```

---

## Support & Resources

**Official Documentation:**
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- PM2: https://pm2.keymetrics.io/docs/usage/quick-start/
- Prisma: https://www.prisma.io/docs/

**Community:**
- Cloudflare Community: https://community.cloudflare.com/
- PM2 GitHub Issues: https://github.com/Unitech/pm2/issues
- Raspberry Pi Forums: https://forums.raspberrypi.com/

---

**Document Status:** Ready for Use  
**Last Updated:** December 10, 2025  
**Next Review:** After first production deployment
