#!/bin/sh
set -e

# PUID/PGID handling (like linuxserver.io images)
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting Cinephage with UID:$PUID GID:$PGID"

# Update node user/group to match PUID/PGID
if [ "$PGID" != "$(id -g node)" ]; then
  groupmod -o -g "$PGID" node
fi

if [ "$PUID" != "$(id -u node)" ]; then
  usermod -o -u "$PUID" node
fi

# Ensure data and logs directories exist with correct ownership
mkdir -p data logs
chown -R node:node data logs

# Copy bundled indexers if data/indexers is empty or missing
INDEXER_DIR="data/indexers"
BUNDLED_DIR="/app/bundled-indexers"

if [ -d "$BUNDLED_DIR" ]; then
  if [ ! -d "$INDEXER_DIR" ] || [ -z "$(ls -A "$INDEXER_DIR" 2>/dev/null)" ]; then
    echo "Initializing indexer definitions from bundled files..."
    cp -r "$BUNDLED_DIR" "$INDEXER_DIR"
    chown -R node:node "$INDEXER_DIR"
  fi
fi

echo "Starting application..."
exec su-exec node "$@"
