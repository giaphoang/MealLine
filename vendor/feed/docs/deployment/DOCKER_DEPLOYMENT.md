# Docker Deployment Guide - FEED Application

Deploy from Mac to Raspberry Pi 5 using multi-architecture Docker images.

## Prerequisites

**On Mac:**
- Docker Desktop installed
- Docker Buildx enabled (included in Docker Desktop)
- Docker Hub or GitHub Container Registry account

**On Raspberry Pi 5:**
- Raspberry Pi OS 64-bit (Bookworm recommended)
- Docker and Docker Compose installed
- Cloudflare account configured

## Quick Start

### 1. Setup Multi-Architecture Builder (Mac - One Time)

```bash
# Create and use buildx builder
docker buildx create --name multiarch --driver docker-container --use
docker buildx inspect --bootstrap
```

### 2. Configure Environment Variables

**Mac (for build):**
```bash
cd /Users/russbook/Repos/williamtemple-feed
cp packages/backend/.env.docker.example packages/backend/.env
```

Edit `packages/backend/.env` with production values.
Set the frontend API base URL at build time (recommended: empty for same-origin):
```bash
export VITE_API_BASE_URL=""
```
If you prefer an explicit value, use `export VITE_API_BASE_URL="https://feed.williamtemple.app"`.

### 3. Build Multi-Architecture Images (Mac)

Before building a production frontend, finalize `docs/release-notes.md`:
remove the `Unreleased` heading and put the version being shipped first.
The version-number dialog renders this file directly, so draft labels become
visible to staff. Check the built release notes as part of release verification.
`CHANGELOG.md` is separate and may keep its developer-facing Unreleased section.

```bash
cd /Users/russbook/Repos/williamtemple-feed

# Option A: Build and push to registry (recommended)
export DOCKER_REGISTRY="yourusername"  # Docker Hub username (not email) or ghcr.io/username
export VERSION="0.14.9"

./docker-build.sh

# Or, run the equivalent buildx commands manually:
docker buildx build --platform linux/amd64,linux/arm64 \
  --target backend \
  -t ${DOCKER_REGISTRY}/feed-backend:${VERSION} \
  -t ${DOCKER_REGISTRY}/feed-backend:latest \
  --push .

docker buildx build --platform linux/amd64,linux/arm64 \
  --target frontend \
  --build-arg VITE_API_BASE_URL=${VITE_API_BASE_URL} \
  -t ${DOCKER_REGISTRY}/feed-frontend:${VERSION} \
  -t ${DOCKER_REGISTRY}/feed-frontend:latest \
  --push .

# Option B: Build locally for testing (single-arch)
docker buildx build --target backend -t feed/backend:latest --load .
docker buildx build --target frontend -t feed/frontend:latest --load .
```

### 4. Deploy to Raspberry Pi

> **Access note.** This Pi is administered over a Raspberry Pi Connect
> screen-share session, not SSH — direct SSH to it is known to drop. The `scp`
> and `ssh` commands below describe the shape of each step; in practice they are
> run by a person in that session, and files move by the screen-share tool's own
> transfer rather than from the build Mac.

**Transfer files to Pi:**
```bash
# From Mac
scp docker-compose.yml pi@feed-pi.local:~/apps/williamtemple-feed/
scp -r docker pi@feed-pi.local:~/apps/williamtemple-feed/
scp -r packages/backend/.env pi@feed-pi.local:~/apps/williamtemple-feed/packages/backend/.env
```

**On Raspberry Pi:**
```bash
# SSH into Pi
ssh pi@feed-pi.local

# Navigate to deployment directory
cd ~/apps/williamtemple-feed

# Create required directories
mkdir -p data/backend data/storage logs/backend
```

**Set the version in `.env`, not with `export`.** See
[Choosing the deployed version](#choosing-the-deployed-version) below — this is
the step where a deploy can silently install the wrong build.

```bash
# ~/apps/williamtemple-feed/.env  (compose reads this automatically)
DOCKER_REGISTRY=yourusername
VERSION=1.6.0
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
```

```bash
# Confirm what will actually deploy BEFORE deploying
docker compose config | grep "image:"

# Pull and start services
docker compose pull
docker compose up -d

# Verify services
docker compose ps
docker compose logs -f
```

### Choosing the deployed version

`docker-compose.yml` resolves images as
`${DOCKER_REGISTRY}/feed-backend:${VERSION}`. Compose fills those in from two
places, and **the shell wins over `.env` only while the shell still has them**:

1. shell environment (`export VERSION=…`)
2. the `.env` file in the compose project directory

That ordering is a trap on a remote host. If the session drops — or the terminal
is reconnected, or the commands are pasted into a fresh shell — the exports
vanish and compose falls back to whatever `.env` says. If `.env` is stale, the
deploy **succeeds** while installing an old build. It fails backwards, silently.

This happened on 2026-07-29: a stale `VERSION=1.0.10` in `.env` rolled
production back several versions mid-deploy. `docker compose pull` had already
run with the exports alive and fetched the right images, so the pull output
looked correct; `up` then started the wrong ones.

Therefore:

- **Edit `.env`.** It survives session drops and is the durable record of what
  the host is running.
- **Always run `docker compose config | grep "image:"` before `up`.** It prints
  the fully-resolved tags after every source is merged, and is the only check
  that reflects what `up` will really do.
- **Verify the running images afterwards**, not just container health:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

- **Confirm the backend matches the repo.** The migration count is a good
  fingerprint — an image built from a different commit reports a different
  number:

```bash
docker compose logs backend --tail=40 | grep -iE "migrations found|journal_mode"
```

A healthy beta.2 deploy reports `23 migrations found`,
`No pending migrations to apply`, and `[db] SQLite journal_mode=wal`. A
container can be `healthy` and still be the wrong build — health checks only
prove the process is answering.

### 5. Setup Cloudflare Tunnel

This Docker setup serves the frontend via Nginx and proxies `/api/*` to the backend (see `docker/nginx.conf`), so you only need **one** public hostname: `feed.williamtemple.app` → `http://frontend:80`.

**Get tunnel token:**
```bash
# On Pi
cloudflared tunnel create feed-tunnel

# Get token
cloudflared tunnel token feed-tunnel
# Copy the token for docker-compose
```

**Or use config file method:**
Create `docker/cloudflared/config.yml`:
```yaml
tunnel: YOUR-TUNNEL-UUID
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: feed.williamtemple.app
    service: http://frontend:80
  - service: http_status:404
```

Update docker-compose.yml to mount config:
```yaml
cloudflared:
  volumes:
    - ./docker/cloudflared:/etc/cloudflared
```

### 6. Configure DNS

```bash
# Route domain to tunnel
cloudflared tunnel route dns feed-tunnel feed.williamtemple.app
```

## Testing Locally (Mac)

Test before deploying to Pi:

```bash
# Optional: local overrides to fix cookies on localhost
cat > /Users/russbook/Repos/williamtemple-feed/packages/backend/.env.local <<'EOF'
APP_URL="http://localhost:5173"
COOKIE_DOMAIN=""
EOF

# Build + start backend + frontend (skip Cloudflare tunnel locally)
docker compose -f /Users/russbook/Repos/williamtemple-feed/docker-compose.yml \
  -f /Users/russbook/Repos/williamtemple-feed/docker-compose.local.yml \
  up -d --build backend frontend

# Check health
curl http://localhost:3001/health
curl http://localhost:5173

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Database Seeding (Optional)

Run the seed script in a one-off container. This uses the backend builder stage
so TypeScript tooling is available without bloating the runtime image.

**Mac (local overrides):**
```bash
docker compose -f /Users/russbook/Repos/williamtemple-feed/docker-compose.yml \
  -f /Users/russbook/Repos/williamtemple-feed/docker-compose.local.yml \
  --profile seed run --rm seed
```

**Raspberry Pi (production):**
```bash
docker compose --profile seed run --rm seed
```

## Common Commands

**Build & Deploy:**
```bash
# Build multi-arch and push
docker buildx build --platform linux/amd64,linux/arm64 \
  --target backend -t ${DOCKER_REGISTRY}/feed-backend:${VERSION} --push .

# Pull on Pi
docker compose pull
docker compose up -d
```

**Manage Services:**
```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart specific service
docker compose restart backend

# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f cloudflared

# Execute commands in container
docker compose exec backend sh
docker compose exec backend ./node_modules/.bin/prisma studio
```

**Database Operations:**
```bash
# Run migrations
docker compose exec backend ./node_modules/.bin/prisma migrate deploy

# Open Prisma Studio
docker compose exec backend ./node_modules/.bin/prisma studio

# Backup database
docker compose exec backend sqlite3 /app/data/production.db ".backup /app/data/backup.db"

# Copy backup to host
docker compose cp backend:/app/data/backup.db ./backups/
```

**Use `.backup`, not `cp`.** The database runs in WAL mode (set at startup in
`src/db.ts`, so readers are not blocked while an import writes). In WAL mode the
most recent commits can live in the `-wal` sidecar rather than the main file, so
copying `production.db` on its own can silently produce a backup that is missing
the newest data. `sqlite3 .backup` accounts for this and always yields a
transactionally consistent single file. You will see `production.db-wal` and
`production.db-shm` alongside the database; both are expected, and neither
should be deleted while the container is running.

Verify a backup before trusting it:

```bash
sqlite3 ~/backups/feed/backup_YYYYMMDD_HHMMSS.db "PRAGMA integrity_check;"
```

Note: Recent releases add AI Configuration token limit fields (`inputTokenLimit`, `outputTokenLimit`). After updating images, run migrations and verify these columns exist before testing the AI Configuration modal.

**Monitor Resources:**
```bash
# Container stats
docker stats

# Disk usage
docker system df

# Cleanup
docker system prune -a
```

## Updating Application

> **Both images, not just the backend.** Nginx runs in the *frontend* image, and
> its `client_max_body_size` for `/api/admin/restore` is what allows a backup to
> be uploaded at all. A deployment that rebuilds only the backend keeps an old
> proxy config and rejects production-sized backups at 64 MB with a 413 that
> never reaches the application. See ISSUES.md #83.



**From Mac:**
```bash
# Make code changes
git commit -am "Update feature"

# Build new version
export VERSION="0.14.9"
docker buildx build --platform linux/amd64,linux/arm64 \
  --target backend -t ${DOCKER_REGISTRY}/feed-backend:${VERSION} --push .
docker buildx build --platform linux/amd64,linux/arm64 \
  --target frontend -t ${DOCKER_REGISTRY}/feed-frontend:${VERSION} --push .
```

**On Pi:**

Pull the repo first if the release touched anything compose mounts — the
`./docker` directory (nginx config) is bind-mounted, so `docker compose pull`
alone will run new images behind the old proxy configuration.

```bash
cd ~/apps/williamtemple-feed && git --no-pager pull --ff-only
```

Set the version in `.env`, verify, then deploy:

```bash
sed -i 's/^VERSION=.*/VERSION=1.6.0/' .env && grep -E "^VERSION|^DOCKER_REGISTRY" .env
```

```bash
docker compose config | grep "image:"
```

```bash
docker compose pull && docker compose up -d
```

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

### Re-importing data after an adapter fix

Deploying a parser fix corrects the *next* import. It does nothing to rows
already written — those keep whatever the old parser stored, and the cards keep
drawing them. When a release fixes an adapter, the data needs a re-import
afterwards.

**Re-import. Do not delete the data first.** Revisions are keyed on `(source,
sourceRecordKey)`, so activating a new import clears `isCurrent` across those
keys and re-sets it on the new revision. Analytics joins every profile response
through its revision under `isCurrent = 1`, so the old rows stop being visible
the moment the new ones land. Deleting first only opens a window with the data
absent, and leans on the delete/restore path.

Two things to confirm before running it:

- **The export must cover the whole period the bad import covered.**
  Superseding only touches keys present in the new file, so an export that
  stops short leaves the tail current and wrong — and it will look fixed,
  because the bulk was replaced.
- **The fix must not have changed how `sourceRecordKey` is derived.** If it
  did, the new rows will not displace the old ones; both stay current and the
  totals double. Check the adapter diff before importing.

Then verify on Analytics → Clients that the affected card draws whole category
names rather than sentence fragments.

*1.5.0 case:* the SIMC comma fix (`b93eead`). Re-import the SIMC export from the
June 2026 changeover through today. `packages/backend/scripts/repair-simc-comma-labels.ts`
is the fallback if the original export is not available; it is a dry run unless
given `--confirm`.

## Rollback

Same discipline: edit `.env`, confirm resolution, then deploy.

```bash
sed -i 's/^VERSION=.*/VERSION=1.5.0-beta.9/' .env && docker compose config | grep "image:"
```

```bash
docker compose pull && docker compose up -d
```

**Check the target tag exists before relying on this.** Rollback assumes that
version was pushed to the registry; if it was not, the only path back is
rebuilding from the corresponding commit.

```bash
docker manifest inspect et2geiger/feed-backend:1.5.0-beta.9 > /dev/null && echo "tag exists"
```

**Rolling back across a migration is not symmetrical.** `prisma migrate deploy`
only rolls forward. An older image whose migration set is a subset of what the
database has applied will report "no pending migrations" and start anyway — it
will not revert schema. That is survivable when the newer migrations are
additive, but it means the app is running against a schema it does not fully
know. Take a database backup before any rollback that crosses a migration, and
prefer restoring that backup over relying on an older image to cope.

## Backup Strategy

**Automated daily backup (add to Pi crontab):**
```bash
# Create backup script
cat > ~/apps/williamtemple-feed/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups/feed
mkdir -p $BACKUP_DIR

# Backup database
docker compose -f ~/apps/williamtemple-feed/docker-compose.yml exec -T backend \
  sqlite3 /app/data/production.db ".backup /app/data/backup_${DATE}.db"

# Copy to host
docker compose -f ~/apps/williamtemple-feed/docker-compose.yml cp \
  backend:/app/data/backup_${DATE}.db ${BACKUP_DIR}/

# Compress
gzip ${BACKUP_DIR}/backup_${DATE}.db

# Keep last 7 days
find $BACKUP_DIR -name "backup_*.db.gz" -mtime +7 -delete

echo "Backup completed: backup_${DATE}.db.gz"
EOF

chmod +x ~/apps/williamtemple-feed/backup.sh

# Add to crontab (2 AM daily)
(crontab -l 2>/dev/null; echo "0 2 * * * ~/apps/williamtemple-feed/backup.sh >> ~/logs/feed/backup.log 2>&1") | crontab -
```

## Troubleshooting

**Images won't build:**
```bash
# Clear buildx cache
docker buildx prune -af

# Rebuild without cache
docker buildx build --no-cache --platform linux/arm64 --target backend -t feed/backend:latest --load .
```

**Container won't start:**
```bash
# Check logs
docker compose logs backend

# Check environment
docker compose exec backend env

# Shell into container
docker compose exec backend sh
```

**Database locked:**
```bash
# Restart backend
docker compose restart backend

# Check database
docker compose exec backend sqlite3 /app/data/production.db "PRAGMA integrity_check;"
```

**High memory usage:**
```bash
# Set memory limits in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
```

**Cloudflare tunnel disconnected:**
```bash
# Check cloudflared logs
docker compose logs cloudflared

# Restart tunnel
docker compose restart cloudflared
```

## Architecture Notes

**Why multi-stage build:**
- Separate build and runtime environments
- Smaller final images (no build tools in production)
- Better caching layers
- Single Dockerfile for entire stack

**Why buildx:**
- Build ARM64 images on Mac (AMD64)
- Push multi-architecture manifests
- Pi automatically pulls correct architecture

**Volume mounts:**
- `./data/backend` → SQLite database (persistent)
- `./data/storage` → Uploaded files/translations (persistent)
- `./logs` → Application logs (optional)

**Health checks:**
- Backend: `/health` endpoint
- Frontend: Nginx health endpoint
- Cloudflared: Depends on backend/frontend health

## Performance Tips

**On Raspberry Pi 5:**

1. **Use overlay2 storage driver** (default in modern Docker)
2. **Limit container memory** if experiencing OOM
3. **Use volumes not bind mounts** for better I/O
4. **Enable swap** if needed:
```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile  # Set CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

## Security Checklist

- [ ] Environment files have sensitive data removed from repo
- [ ] JWT secret is strong and unique
- [ ] Database files have proper permissions
- [ ] Cloudflare Tunnel token is secure
- [ ] Container user is non-root (TODO: add to Dockerfile)
- [ ] Rate limiting configured in backend
- [ ] HTTPS enforced via Cloudflare
- [ ] Regular backups scheduled
- [ ] Log rotation configured

## Next Steps

1. **Add container user** (run as non-root)
2. **Configure log rotation** for container logs
3. **Set up monitoring** (Prometheus + Grafana)
4. **Add health check dashboard**
5. **Configure alerts** for container failures
6. **Document disaster recovery**

## Support

**Issues:**
- Check logs first: `docker compose logs -f`
- Verify environment: `docker compose config`
- Test connectivity: `docker compose exec backend wget -O- http://frontend/`

**Useful commands:**
```bash
# Full system check
docker compose ps
docker compose logs --tail=100
docker stats
df -h
free -h
```
