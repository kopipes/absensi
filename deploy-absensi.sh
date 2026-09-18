#!/bin/bash
# Absensi Safe Deploy Script
# SOT: https://github.com/kopipes/absensi.git
# DB SOT: VPS (SQLite preserved across deploys)
# Usage:
#   sudo bash /var/www/deploy-absensi.sh          # deploy latest
#   sudo bash /var/www/deploy-absensi.sh rollback  # rollback to last backup

set -e

APP_DIR=/var/www/absensi
BACKUP_DIR=/var/www/absensi-backups
DB_FILE=$APP_DIR/prisma/dev.db
REPO=https://github.com/kopipes/absensi.git
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PORT=3002
SERVICE=absensi

mkdir -p $BACKUP_DIR

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
    cp "$DB_FILE" "$BACKUP_DIR/rollback-db-$TIMESTAMP.db"
    echo "Current DB saved to $BACKUP_DIR/rollback-db-$TIMESTAMP.db"
  fi

  rsync -a --delete \
    --exclude='prisma/dev.db' \
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
  cp "$DB_FILE" "$BACKUP_DIR/db-$TIMESTAMP.db"
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

# 5. Install all dependencies (devDeps needed for Next.js build)
echo "4. Installing dependencies..."
cd $APP_DIR
npm ci 2>&1 | tail -5

# 6. Generate Prisma client
echo "5. Generating Prisma client..."
npx prisma generate

# 7. Push DB schema (safe — only adds new tables/columns, no data loss)
echo "6. Pushing DB schema (safe migration)..."
npx prisma db push --skip-generate

# 8. Seed only if DB has no users (true first deploy)
echo "7. Checking if seed needed..."
USER_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.user.count().then(n => { console.log(n); p.\$disconnect(); });
" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "   Seeding database (first deploy)..."
  npm run db:seed
else
  echo "   Skipping seed ($USER_COUNT users already exist)."
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
ExecStart=/usr/bin/node node_modules/.bin/next start -p $PORT
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
echo "   App:      https://absensi.provaliantgroup.com"
echo "   Port:     $PORT"
echo "   Logs:     journalctl -u $SERVICE -f"
echo "   Status:   systemctl status $SERVICE"
echo "   Rollback: sudo bash /var/www/deploy-absensi.sh rollback"
