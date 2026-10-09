# FEED App Deployment Troubleshooting Guide

**Quick Reference for Common Deployment Issues**

---

> Note: This guide focuses on the **PM2-based** deployment path. For Docker Compose / container-specific issues, start with `docs/deployment/DOCKER_DEPLOYMENT.md` and then use the Cloudflare Tunnel sections here as needed.

## Table of Contents

1. [Application Issues](#application-issues)
2. [Cloudflare Tunnel Issues](#cloudflare-tunnel-issues)
3. [Database Issues](#database-issues)
4. [Authentication Issues](#authentication-issues)
5. [Performance Issues](#performance-issues)
6. [Network Issues](#network-issues)

---

## Application Issues

### ❌ PM2 Shows "errored" Status

**Symptoms:**
```bash
pm2 list
# Shows: feed-backend | errored | 5
```

**Diagnosis:**
```bash
pm2 logs feed-backend --err
```

**Common Causes & Fixes:**

1. **Missing environment variables:**
```bash
cd ~/feed/packages/backend
cat .env  # Verify all required vars present
```

2. **TypeScript compilation error:**
```bash
cd ~/feed/packages/backend
npm run build  # Runs tsc; should exit 0

# If it fails:
# 1) Ensure Node 24+ and npm 11+: node -v; npm -v
# 2) Reinstall with legacy peer handling:
npm install --legacy-peer-deps
# 3) Regenerate Prisma client:
npx prisma generate
# 4) Clear stale artifacts:
rm -rf dist
# 5) Retry build:
npm run build

# Notes:
# - tsconfig now excludes __tests__ so Jest files don't break the build.
# - A clean build is required before deployment (pre-deploy sanity check).
```

3. **Port already in use:**
```bash
sudo lsof -i :3001
sudo kill -9 <PID>
pm2 restart feed-backend
```

4. **Module not found:**
```bash
cd ~/feed
npm install --legacy-peer-deps
pm2 restart all
```

---

### ❌ Frontend Not Serving

**Symptoms:**
- `curl http://localhost:5173` returns error
- PM2 shows online but health check fails

**Check:**
```bash
# Verify build directory exists
ls -la ~/feed/packages/frontend/dist/

# If missing, rebuild
cd ~/feed/packages/frontend
npm run build
pm2 restart feed-frontend
```

**Verify serve is installed:**
```bash
which serve
# If not found:
sudo npm install -g serve
```

---

### ❌ Apps Keep Restarting

**Check logs for crash reasons:**
```bash
pm2 logs --lines 100
```

**Common causes:**

1. **Memory limit reached:**
```bash
# Check current limits
pm2 show feed-backend

# Increase in ecosystem.config.js:
# max_memory_restart: '1G'  # Increase from 500M

pm2 restart all
```

2. **Uncaught exceptions:**
```bash
# Look for errors in logs
pm2 logs feed-backend --err

# Fix the error in code, then:
cd ~/feed
git pull  # Get fixes
npm install --legacy-peer-deps
pm2 restart all
```

---

## Cloudflare Tunnel Issues

### ❌ Tunnel Shows "Unhealthy" in Dashboard

**Check tunnel status:**
```bash
sudo systemctl status cloudflared
```

**Common issues:**

1. **Service not running:**
```bash
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

2. **Configuration error:**
```bash
# Test config
cloudflared tunnel run feed-tunnel

# Check for errors, then fix config.yml
nano ~/.cloudflared/config.yml

# Restart service
sudo systemctl restart cloudflared
```

3. **Credentials file missing:**
```bash
ls -la ~/.cloudflared/*.json

# If missing, recreate tunnel:
cloudflared tunnel create feed-tunnel-new
# Update config.yml with new UUID
```

---

### ❌ Site Not Accessible (502/503 Error)

**Step-by-step diagnosis:**

1. **Check local apps are running:**
```bash
curl http://localhost:3001/health  # Backend
curl http://localhost:5173  # Frontend

# If either fails, check PM2:
pm2 list
pm2 restart all
```

2. **Check tunnel is routing correctly:**
```bash
sudo journalctl -u cloudflared -f

# Look for lines like:
# "proxying this connection to http://localhost:5173"

# If not routing, check config.yml
nano ~/.cloudflared/config.yml
```

3. **Verify DNS propagation:**
```bash
nslookup feed.williamtemple.app

# Should show Cloudflare CNAME:
# feed.williamtemple.app canonical name = UUID.cfargotunnel.com
```

4. **Check Cloudflare dashboard:**
- Go to https://dash.cloudflare.com
- Zero Trust → Access → Tunnels
- Should show "Healthy" status

---

### ❌ Alerts Stream 504 (SSE)

**Symptoms:**
- "Alerts failed to load" toast
- 504 on `https://feed.williamtemple.app/api/alerts/stream`

**Checks:**
1. **Verify Nginx SSE proxy config (Docker):**
```bash
sudo docker exec feed-frontend sed -n '/api\\/alerts\\/stream/,/location \\/api\\//p' /etc/nginx/conf.d/default.conf
```
Ensure the `/api/alerts/stream` block has `proxy_buffering off` and long timeouts.

2. **Confirm backend SSE keepalive locally:**
```bash
curl -iN http://localhost:3001/api/alerts/stream
```
You should see an immediate `: connected` line and periodic `: keepalive` pings.

3. **Rebuild frontend image after config changes:**
```bash
DOCKER_REGISTRY="et2geiger" VERSION="X.Y.Z" ./docker-build.sh
```

---

### ❌ DNS Not Resolving

**Check DNS setup:**
```bash
nslookup feed.williamtemple.app

# If "Name or service not known":
```

1. **Verify tunnel route created:**
```bash
cloudflared tunnel route dns feed-tunnel feed.williamtemple.app
```

2. **Check Cloudflare DNS records:**
- Dashboard → DNS → Records
- Should see CNAME: feed → UUID.cfargotunnel.com

3. **Wait for propagation** (can take up to 48 hours)

**Test from different network:**
- Use phone with cellular data (not WiFi)
- Use online DNS checker: https://dnschecker.org/

---

## Database Issues

### ❌ "SQLITE_BUSY: database is locked"

**Cause:** Another process is using the database

**Fix:**
```bash
# Check for zombie processes
ps aux | grep node
ps aux | grep prisma

# Kill any stale processes
sudo kill -9 <PID>

# Restart apps
pm2 restart all
```

**Prevention:**
```bash
# Ensure only PM2 processes access DB
pm2 list

# Should only see feed-backend and feed-frontend
```

---

### ❌ "table X does not exist"

**Cause:** Migrations not applied

**Fix:**
```bash
cd ~/feed/packages/backend

# Apply migrations
npx prisma migrate deploy

# Regenerate client
npx prisma generate

# Restart
pm2 restart feed-backend
```

---

### ❌ Database Corruption

**Check integrity:**
```bash
cd ~/feed/packages/backend
sqlite3 production.db "PRAGMA integrity_check;"
```

**If corrupted, restore from backup:**
```bash
# Stop apps
pm2 stop all

# List backups
ls -lh ~/backups/feed/

# Decompress latest backup
cd ~/backups/feed
gunzip feed_backup_YYYYMMDD_HHMMSS.db.gz

# Restore
cp feed_backup_YYYYMMDD_HHMMSS.db ~/feed/packages/backend/production.db

# Restart
pm2 restart all
```

---

## Authentication Issues

### ❌ Magic Link/OTP Email Not Arriving

**Check Resend configuration:**
```bash
cd ~/feed/packages/backend
grep RESEND .env
# Verify key starts with "re_"
```

**Test Resend manually:**
```bash
# Create test script
nano test-email.js
```

```javascript
const { Resend } = require('resend');
const resend = new Resend('re_YOUR_KEY');

resend.emails.send({
  from: 'login@williamtemple.app',
  to: 'your@williamtemple.org',
  subject: 'Test',
  html: '<p>Test email</p>'
}).then(console.log).catch(console.error);
```

```bash
node test-email.js
```

**Check Resend dashboard:**
- Go to https://resend.com/emails
- Look for sent emails and delivery status

**Common issues:**
1. Invalid API key → Generate new key in Resend dashboard
2. Domain not verified → Verify williamtemple.app in Resend
3. Recipient email blocked → Check Resend logs

---

### ❌ "Invalid or expired verification code"

**Check system time:**
```bash
date
# Should match actual time

# If wrong:
sudo timedatectl set-timezone America/Los_Angeles
sudo systemctl restart systemd-timesyncd
```

**Check OTP expiry:**
- OTP codes expire in 3 minutes
- Magic links expire in 10 minutes
- Request new code if expired

**Check rate limiting:**
```bash
# Look for rate limit errors in logs
pm2 logs feed-backend | grep -i "rate limit"

# If rate limited, wait 1 hour or restart backend:
pm2 restart feed-backend
```

---

### ❌ "Authentication required" on Every Request

**Check JWT cookie setup:**
```bash
cd ~/feed/packages/backend
grep COOKIE_DOMAIN .env
# Should be: COOKIE_DOMAIN=".williamtemple.app"

grep APP_URL .env
# Should be: APP_URL="https://feed.williamtemple.app"
```

**Verify cookie settings in auth code:**
```bash
# Check backend/src/routes/auth/index.ts
# Cookie should have:
# - httpOnly: true
# - secure: true (in production)
# - sameSite: 'strict'
# - domain: process.env.COOKIE_DOMAIN
```

**Browser debugging:**
- Open DevTools → Application → Cookies
- Check for `auth_token` cookie
- Should be HttpOnly, Secure, SameSite=Strict

---

## Performance Issues

### ❌ High Memory Usage

**Check current usage:**
```bash
pm2 monit
# or
htop
```

**Common causes:**

1. **Memory leak in application:**
```bash
# Monitor over time
pm2 monit

# If steadily increasing, restart apps:
pm2 restart all
```

2. **Too many logs:**
```bash
# Check log sizes
du -sh ~/logs/feed/

# Flush logs
pm2 flush

# Compress old logs
cd ~/logs/feed
gzip *.log
```

3. **Insufficient swap:**
```bash
free -h

# If no swap, create 2GB swap:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

### ❌ Slow Response Times

**Check system resources:**
```bash
# CPU usage
top

# Memory
free -h

# Disk I/O
iotop  # May need to install: sudo apt install iotop
```

**Database performance:**
```bash
# Check database size
du -sh ~/feed/packages/backend/production.db

# If >100MB, consider:
# 1. Archiving old data
# 2. Adding database indices
# 3. Running VACUUM:
sqlite3 production.db "VACUUM;"
```

**Network latency:**
```bash
# Test from Pi to Cloudflare
ping 1.1.1.1

# Should be <50ms
```

---

## Network Issues

### ❌ Cannot SSH into Pi

**From local machine:**
```bash
# Try by hostname
ssh pi@feed-pi.local

# If fails, find IP:
# Check your router's DHCP leases
# Or use IP scanner tool

# Try by IP
ssh pi@192.168.1.XXX
```

**If still can't connect:**
1. Connect monitor and keyboard to Pi
2. Check SSH is enabled:
```bash
sudo systemctl status ssh
sudo systemctl start ssh
sudo systemctl enable ssh
```

---

### ❌ Pi Cannot Reach Internet

**Check connection:**
```bash
ping 1.1.1.1  # Cloudflare DNS
ping google.com  # Test DNS resolution
```

**If ping fails:**
```bash
# Check network interface
ip addr show

# Restart networking
sudo systemctl restart networking

# For WiFi:
sudo raspi-config
# Navigate to: System Options → Wireless LAN
```

---

### ❌ Cloudflare Tunnel Won't Connect

**Check internet connectivity:**
```bash
ping 1.1.1.1
```

**Check cloudflared can reach Cloudflare:**
```bash
curl https://www.cloudflare.com
```

**Check tunnel credentials:**
```bash
ls -la ~/.cloudflared/*.json
cat ~/.cloudflared/config.yml
# Verify UUID matches credentials file name
```

**Reset tunnel if needed:**
```bash
# Stop service
sudo systemctl stop cloudflared

# Delete old tunnel
cloudflared tunnel delete feed-tunnel

# Create new tunnel
cloudflared tunnel create feed-tunnel-new

# Update config.yml with new UUID
nano ~/.cloudflared/config.yml

# Start service
sudo systemctl start cloudflared
```

---

## Emergency Recovery

### Complete Application Reset

```bash
# Stop everything
pm2 stop all
sudo systemctl stop cloudflared

# Restore from backup
cd ~/backups/feed
gunzip feed_backup_YYYYMMDD_HHMMSS.db.gz
cp feed_backup_YYYYMMDD_HHMMSS.db ~/feed/packages/backend/production.db

# Restart
pm2 restart all
sudo systemctl start cloudflared

# Verify
pm2 logs --lines 50
curl http://localhost:3001/health
```

---

### Fresh Start (Last Resort)

```bash
# Backup current state
cd ~/feed
tar -czf ~/feed-backup-$(date +%Y%m%d).tar.gz .

# Remove application
pm2 delete all
rm -rf ~/feed

# Reinstall from scratch
mkdir ~/feed
cd ~/feed
# Follow deployment checklist from beginning
```

---

## Getting Help

### Collect Diagnostic Information

Before asking for help, collect:

```bash
# System info
uname -a
cat /etc/os-release

# Node versions
node -v
npm -v
pm2 -v

# Application status
pm2 list

# Recent logs
pm2 logs --lines 100 > ~/logs/pm2-dump.log

# Cloudflare tunnel status
sudo systemctl status cloudflared > ~/logs/cloudflare-status.log
sudo journalctl -u cloudflared -n 100 > ~/logs/cloudflare-logs.log

# Tar everything up
cd ~/logs
tar -czf diagnostic-$(date +%Y%m%d_%H%M%S).tar.gz *.log
```

Send `diagnostic-YYYYMMDD_HHMMSS.tar.gz` when requesting support.

---

## Quick Command Reference

```bash
# Check status
pm2 list
sudo systemctl status cloudflared

# View logs
pm2 logs
pm2 logs feed-backend --err
sudo journalctl -u cloudflared -f

# Restart services
pm2 restart all
sudo systemctl restart cloudflared

# Test health
curl http://localhost:3001/health
curl http://localhost:5173

# System resources
htop
df -h
free -h

# Network
ping 1.1.1.1
nslookup feed.williamtemple.app

# Database
cd ~/feed/packages/backend
sqlite3 production.db "PRAGMA integrity_check;"
```

---

**Document Status:** Reference Guide  
**Last Updated:** December 10, 2025
