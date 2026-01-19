#!/bin/sh
set -e

# Ensure we're in the app directory
cd /app

# Optional UID/GID remap for non-standard hosts
if [ "$(id -u)" = "0" ] && [ -z "${CINEPHAGE_REEXEC:-}" ]; then
  TARGET_UID="${PUID:-1000}"
  TARGET_GID="${PGID:-1000}"

  echo "Configuring runtime UID/GID: ${TARGET_UID}:${TARGET_GID}"

  if [ "$TARGET_GID" != "$(id -g node)" ]; then
    groupmod -o -g "$TARGET_GID" node
  fi

  if [ "$TARGET_UID" != "$(id -u node)" ]; then
    usermod -o -u "$TARGET_UID" -g "$TARGET_GID" node
  fi

  chown -R node:node /app/data /app/logs /app/camoufox 2>/dev/null || true

  export CINEPHAGE_REEXEC=1
  exec gosu node "$0" "$@"
fi

echo "Running as UID=$(id -u) GID=$(id -g)"

# Verify write access to critical directories
# This catches UID/GID mismatches early with helpful error messages
check_permissions() {
  local dir="$1"
  local name="$2"
  
  # Try to create directory if it doesn't exist
  if [ ! -d "$dir" ]; then
    if ! mkdir -p "$dir" 2>/dev/null; then
      echo "ERROR: Cannot create $name directory at $dir"
      echo ""
      echo "Container is running as UID=$(id -u) GID=$(id -g)"
      echo ""
      echo "To fix this, ensure the host directory has correct ownership:"
      echo "  sudo chown -R $(id -u):$(id -g) $(dirname $dir)"
      echo ""
      echo "Or set CINEPHAGE_UID and CINEPHAGE_GID in your .env file to match"
      echo "your host user (run 'id -u' and 'id -g' to find your IDs)."
      exit 1
    fi
  fi
  
  # Verify we can write to the directory
  if ! touch "$dir/.write-test" 2>/dev/null; then
    echo "ERROR: Cannot write to $name directory at $dir"
    echo ""
    echo "Container is running as UID=$(id -u) GID=$(id -g)"
    echo ""
    echo "To fix this, update the host directory ownership:"
    echo "  sudo chown -R $(id -u):$(id -g) $dir"
    echo ""
    echo "Or set CINEPHAGE_UID and CINEPHAGE_GID in your .env file to match"
    echo "your host user (run 'id -u' and 'id -g' to find your IDs)."
    exit 1
  fi
  rm -f "$dir/.write-test"
}

# Check critical directories before proceeding
echo "Checking directory permissions..."
check_permissions "/app/data" "data"
check_permissions "/app/logs" "logs"
echo "Directory permissions OK"

# Copy bundled indexers if definitions directory is empty or missing
# Use absolute paths to avoid working directory issues
DEFINITIONS_DIR="/app/data/indexers/definitions"
BUNDLED_DIR="/app/bundled-indexers"

if [ -d "$BUNDLED_DIR" ]; then
  # Check if definitions directory is missing or empty
  if [ ! -d "$DEFINITIONS_DIR" ] || [ -z "$(ls -A "$DEFINITIONS_DIR" 2>/dev/null)" ]; then
    echo "Initializing indexer definitions from bundled files..."
    # Create parent directories if needed
    mkdir -p /app/data/indexers
    # Copy contents of bundled-indexers to data/indexers
    cp -r "$BUNDLED_DIR"/* /app/data/indexers/
    echo "Copied $(ls -1 "$DEFINITIONS_DIR" 2>/dev/null | wc -l) indexer definitions"
  else
    echo "Indexer definitions already present ($(ls -1 "$DEFINITIONS_DIR" | wc -l) files)"
  fi
else
  echo "Warning: Bundled indexers directory not found at $BUNDLED_DIR"
fi

# Verify Camoufox browser is present (downloaded at build time)
# Cache is stored in /app/camoufox for non-standard UID/GID compatibility
CAMOUFOX_CACHE_DIR="${CAMOUFOX_CACHE_DIR:-/app/.cache/camoufox}"
CAMOUFOX_MARKER="$CAMOUFOX_CACHE_DIR/version.json"
if [ -f "$CAMOUFOX_MARKER" ]; then
  echo "Camoufox browser ready"
else
  # Fallback: attempt runtime download if somehow missing
  echo "Warning: Camoufox browser not found, attempting download..."
  mkdir -p "$CAMOUFOX_CACHE_DIR"
  if ./node_modules/.bin/camoufox-js fetch; then
    echo "Camoufox browser installed successfully"
    touch "$CAMOUFOX_MARKER"
  else
    echo "Warning: Failed to download Camoufox browser. Captcha solving will be unavailable."
  fi
fi

echo "Starting Cinephage..."
exec "$@"
