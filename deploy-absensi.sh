#!/bin/bash
# Absensi Safe Deploy Script
# SOT: https://github.com/kopipes/absensi.git
# DB SOT: VPS (SQLite preserved across deploys)
# Usage:
#   sudo bash /var/www/absensi/deploy-absensi.sh          # deploy latest
#   sudo bash /var/www/absensi/deploy-absensi.sh rollback  # rollback to last backup
#   sudo SEED_ON_FIRST_DEPLOY=1 bash /var/www/absensi/deploy-absensi.sh  # seed demo data

set -e

# Use the public npm registry explicitly (some hosts have a broken/offline mirror
# in root's .npmrc). Override by exporting NPM_CONFIG_REGISTRY before running.
export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"

APP_DIR=/var/www/absensi
BACKUP_DIR=/var/www/absensi-backups
DB_FILE=$APP_DIR/prisma/dev.db
REPO=https://github.com/kopipes/absensi.git
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PORT=3030
SERVICE=absensi

mkdir -p $BACKUP_DIR

# WAL-safe DB backup: prefer sqlite3 .backup (consistent while the app is running),
# fall back to cp only when sqlite3 is unavailable.
backup_db() {
  local dest="$1"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_FILE" ".backup '$dest'"
  else
    cp "$DB_FILE" "$dest"
    echo "   WARNING: sqlite3 not found — used cp (may be inconsistent while WAL is active)"
  fi
}

# Ensure git trusts this directory (avoids dubious ownership errors)
git config --global --add safe.directory $APP_DIR 2>/dev/null || true

# ── ROLLBACK ───────────────────────────────────────────────────────────────────
if [ "$1" == "rollback" ]; then
  LATEST=$(ls -t $BACKUP_DIR | grep -E '^[0-9]{8}_' | head -1)
  if [ -z "$LATEST" ]; then
    echo "No backups found in $BACKUP_DIR"
    exit 1
  fi
  echo "Rolling back to: $LATEST"

  # Preserve current DB before overwriting
  if [ -f "$DB_FILE" ]; then
    backup_db "$BACKUP_DIR/rollback-db-$TIMESTAMP.db"
    echo "Current DB saved to $BACKUP_DIR/rollback-db-$TIMESTAMP.db"
  fi

  rsync -a --delete \
    --exclude='prisma/dev.db' \
    --exclude='uploads' \
    --exclude='.env' \
    "$BACKUP_DIR/$LATEST/" "$APP_DIR/"

  chown -R www-data:www-data $APP_DIR
  systemctl restart $SERVICE
  sleep 3
  systemctl is-active $SERVICE && echo "Rollback complete to $LATEST — service running" || echo "WARNING: Service failed to start"
  exit 0
fi

# ── FORWARD DEPLOY ─────────────────────────────────────────────────────────────
echo "=== Absensi Deploy $TIMESTAMP ==="

# 1. Backup current code (exclude DB and node_modules — too large)
if [ -d "$APP_DIR/.git" ]; then
  echo "1. Backing up current version (code only)..."
  mkdir -p "$BACKUP_DIR/$TIMESTAMP"
  rsync -a \
    --exclude='prisma/dev.db' \
    --exclude='uploads' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.env' \
    "$APP_DIR/" "$BACKUP_DIR/$TIMESTAMP/"
  echo "   Backup saved: $BACKUP_DIR/$TIMESTAMP"
else
  echo "1. No existing install — skipping backup."
fi

# 2. Backup DB separately
if [ -f "$DB_FILE" ]; then
  echo "2. Backing up database..."
  backup_db "$BACKUP_DIR/db-$TIMESTAMP.db"
  echo "   DB backup: $BACKUP_DIR/db-$TIMESTAMP.db"
fi

# 3. Clone or pull from GitHub
echo "3. Pulling latest from GitHub..."
if [ -d "$APP_DIR/.git" ]; then
  cd $APP_DIR
  git fetch origin main
  git reset --hard origin/main
else
  # Directory exists but no git repo — sync contents
  TEMP_DIR=$(mktemp -d)
  git clone $REPO $TEMP_DIR
  rsync -a --exclude='.env' --exclude='prisma/dev.db' $TEMP_DIR/ $APP_DIR/
  rm -rf $TEMP_DIR
  cd $APP_DIR
fi

# 4. Restore .env if missing (never overwrite existing production .env)
if [ ! -f "$APP_DIR/.env" ]; then
  echo "   WARNING: No .env found."
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    # Use absolute DB path to avoid ambiguity
    sed -i "s|DATABASE_URL=file:./prisma/dev.db|DATABASE_URL=file:$APP_DIR/prisma/dev.db|" "$APP_DIR/.env"
    echo "   Created .env from .env.example — edit it before redeploying!"
  fi
fi

# Ensure DATABASE_URL is always absolute path
sudo bash -c "sed -i 's|DATABASE_URL=file:./prisma/dev.db|DATABASE_URL=file:$APP_DIR/prisma/dev.db|' $APP_DIR/.env" 2>/dev/null || true

# Ensure UPLOAD_DIR is absolute and the directory exists (attendance photos)
if grep -q '^UPLOAD_DIR=' "$APP_DIR/.env" 2>/dev/null; then
  sudo bash -c "sed -i 's|^UPLOAD_DIR=.*|UPLOAD_DIR=$APP_DIR/uploads|' $APP_DIR/.env" 2>/dev/null || true
else
  echo "UPLOAD_DIR=$APP_DIR/uploads" >> "$APP_DIR/.env" 2>/dev/null || true
fi
mkdir -p "$APP_DIR/uploads"

# Ensure APP_URL is the public origin (absolute redirects behind the proxy)
if grep -q '^APP_URL=' "$APP_DIR/.env" 2>/dev/null; then
  sudo bash -c "sed -i 's|^APP_URL=.*|APP_URL=https://absensi.devop.my.id|' $APP_DIR/.env" 2>/dev/null || true
else
  echo "APP_URL=https://absensi.devop.my.id" >> "$APP_DIR/.env" 2>/dev/null || true
fi

# 5. Install all dependencies (devDeps needed for Next.js build)
echo "4. Installing dependencies..."
cd $APP_DIR
npm ci 2>&1 | tail -5

# 6. Generate Prisma client
echo "5. Generating Prisma client..."
npx prisma generate

# 7. Push DB schema. NOTE: the schema dropped legacy tables/columns
# (OvertimeApproval, LeaveRequest, EarlyLeave, overtime columns), so this is
# destructive. The DB was backed up above (db-$TIMESTAMP.db) and rollback is
# available via `deploy-absensi.sh rollback`.
echo "6. Pushing DB schema (destructive drops accepted; DB already backed up)..."
npx prisma db push --skip-generate --accept-data-loss

# 7b. Enable WAL so concurrent absen reads/writes don't fail with "database is locked".
# WAL persists in the DB file, so running this once is enough (idempotent).
if command -v sqlite3 >/dev/null 2>&1; then
  WAL_MODE=$(sqlite3 "$DB_FILE" "PRAGMA journal_mode=WAL;" 2>/dev/null || echo "")
  echo "   SQLite journal_mode: ${WAL_MODE:-unknown}"
else
  echo "   WARNING: sqlite3 not found — install sqlite3 to enable WAL mode"
fi

# 8. Seeding is opt-in only — demo accounts have known passwords and must not
# reach production by default. Run with SEED_ON_FIRST_DEPLOY=1 to seed demo data.
if [ "${SEED_ON_FIRST_DEPLOY:-0}" = "1" ]; then
  echo "7. Seeding database (SEED_ON_FIRST_DEPLOY=1)..."
  npm run db:seed
else
  echo "7. Skipping seed (production-safe default)."
  echo "   Create the first admin manually, or re-run with SEED_ON_FIRST_DEPLOY=1."
fi

# 9. Build Next.js
echo "8. Building Next.js app..."
npm run build

# 10. Set permissions
echo "9. Setting permissions..."
chown -R www-data:www-data $APP_DIR

# 11. Create/update systemd service file
echo "10. Writing systemd service..."
tee /etc/systemd/system/$SERVICE.service > /dev/null << SVCEOF
[Unit]
Description=Absensi Attendance App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=PORT=$PORT
Environment=NODE_ENV=production
Environment=TZ=Asia/Jakarta
ExecStart=/usr/bin/node node_modules/.bin/next start -H 127.0.0.1 -p $PORT
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE

[Install]
WantedBy=multi-user.target
SVCEOF

# 12. Reload systemd and restart
echo "11. Restarting service..."
systemctl daemon-reload
systemctl enable $SERVICE
if systemctl is-active --quiet $SERVICE; then
  systemctl restart $SERVICE
else
  systemctl start $SERVICE
fi
sleep 3
systemctl is-active $SERVICE && echo "   Service is running OK" || echo "   WARNING: Service failed to start — check: journalctl -u $SERVICE -n 20"

# 13. Keep last 5 timestamped code backups (preserve all DB backups)
echo "12. Cleaning old code backups (keeping last 5)..."
ls -t $BACKUP_DIR | grep -E '^[0-9]{8}_' | tail -n +6 | xargs -I{} rm -rf "$BACKUP_DIR/{}"

echo ""
echo "=== Absensi Deploy Complete! ==="
echo "   App:      https://absensi.devop.my.id"
echo "   Port:     $PORT"
echo "   Logs:     journalctl -u $SERVICE -f"
echo "   Status:   systemctl status $SERVICE"
echo "   Rollback: sudo bash /var/www/absensi/deploy-absensi.sh rollback"
