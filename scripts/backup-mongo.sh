#!/usr/bin/env sh
# Nightly MongoDB backup via mongodump.
# Writes a gzipped archive to /backups and prunes archives older than 30 days.
# Runs inside the mongo-backup container defined in docker-compose.prod.yml.
set -e

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
ARCHIVE="/backups/numisroma_${TIMESTAMP}.gz"

echo "[backup] Starting dump at ${TIMESTAMP}"

mongodump \
  --host mongodb \
  --port 27017 \
  --username "${MONGO_USER}" \
  --password "${MONGO_PASS}" \
  --authenticationDatabase admin \
  --db numisroma \
  --gzip \
  --archive="${ARCHIVE}"

echo "[backup] Dump written to ${ARCHIVE}"

# Prune archives older than 30 days
find /backups -name "numisroma_*.gz" -mtime +30 -delete
echo "[backup] Pruned archives older than 30 days"
