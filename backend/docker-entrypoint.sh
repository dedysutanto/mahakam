#!/bin/sh
set -e

mkdir -p /app/uploads/logos

echo "Running database migrations..."
npx prisma migrate deploy

# Generate random password if not set
if [ -z "$SUPER_ADMIN_PASSWORD" ]; then
  SUPER_ADMIN_PASSWORD=$(head -c 16 /dev/urandom | base64 | tr -d '/+=' | head -c 16)
  echo "Generated super admin password: $SUPER_ADMIN_PASSWORD"
fi

# Seed super admin
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-super@mahakam.id}" \
SUPER_ADMIN_PASSWORD="$SUPER_ADMIN_PASSWORD" \
SUPER_ADMIN_NAME="${SUPER_ADMIN_NAME:-Super Admin}" \
npx tsx prisma/seed-superadmin.ts

echo "Starting server..."
exec node dist/server.js
