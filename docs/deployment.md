# Deployment

Production deployment uses Docker Compose with a separate overlay file that adds Caddy (reverse proxy + automatic TLS) and a MongoDB backup cron.

---

## Prerequisites

- Docker ≥ 24 and Docker Compose v2
- A public hostname pointing at your server (for Let's Encrypt)
- Ports 80 and 443 open on the host firewall

---

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Fill in all required values. Production-specific variables:

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your public hostname, e.g. `numisroma.example.com` |
| `BACKUP_DIR` | Host path for MongoDB dump archives, e.g. `/srv/backups/numisroma` |
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB root user (must match the backend connection string) |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB root password |

### 2. Start the stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This brings up:

| Service | Role |
|---------|------|
| `frontend` | Next.js (internal only, no host port) |
| `backend` | Express API (internal only, no host port) |
| `mongodb` | MongoDB 7.0 with persistent volume |
| `caddy` | Reverse proxy, ports 80/443/443-UDP (HTTP/3) |
| `mongo-backup` | Daily 02:00 UTC `mongodump` cron |

### 3. Verify TLS

Caddy fetches a Let's Encrypt certificate automatically on first request to `https://$DOMAIN`. Check logs:

```bash
docker compose logs caddy -f
```

---

## Caddy routing

Defined in `Caddyfile`:

| Path pattern | Upstream |
|-------------|----------|
| `/api/*` | `backend:4000` |
| `/uploads/*` | `backend:4000` |
| `/health*` | `backend:4000` |
| Everything else | `frontend:3000` |

Security headers added by Caddy (in addition to Helmet in the backend):
- `Strict-Transport-Security` with `preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, mic, geolocation disabled)
- Server header removed

---

## MongoDB backup

`docker-compose.prod.yml` runs `mongo-backup` which executes `scripts/backup-mongo.sh`:

- Runs once on container start
- Then runs daily at 02:00 UTC
- Archives are stored at `$BACKUP_DIR` (default `./backups`)
- Requires `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`

To trigger a manual backup:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec mongo-backup /backup-mongo.sh
```

---

## Updates

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Development (no Caddy)

For local development, use the base compose only:

```bash
npm run dev     # alias for: docker compose up
```

Frontend is on `http://localhost:3000`, backend on `http://localhost:4000`.
