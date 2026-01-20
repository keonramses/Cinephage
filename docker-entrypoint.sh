#!/bin/sh
set -e

# ==========================================
# Fix for custom UID support (e.g., Synology)
# ==========================================
# Node.js os.homedir() uses $HOME if set, otherwise looks up UID in /etc/passwd.
# When running with arbitrary UIDs (user: '1026:100'), the UID doesn't exist in
# /etc/passwd, causing os.homedir() to return '/' or fail.
# camoufox-js uses os.homedir() to find its cache, so we must ensure HOME is set.

# Explicitly export HOME to /app (this is also set in Dockerfile but we ensure it here)
export HOME="${HOME:-/app}"

# Create /etc/passwd entry for current UID if it doesn't exist
# This helps libraries that use getpwuid() instead of $HOME
CURRENT_UID=$(id -u)
if ! getent passwd "$CURRENT_UID" > /dev/null 2>&1; then
  # Try to add entry (may fail in read-only /etc, that's OK since we have $HOME)
  if [ -w /etc/passwd ]; then
    echo "cinephage:x:$CURRENT_UID:$(id -g):Cinephage User:$HOME:/bin/sh" >> /etc/passwd 2>/dev/null || true
  fi
fi

# Ensure we're in the app directory
cd /app

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
# HOME is set to /app in Dockerfile, so cache is at /app/.cache/camoufox
CAMOUFOX_MARKER="$HOME/.cache/camoufox/version.json"
if [ -f "$CAMOUFOX_MARKER" ]; then
  echo "Camoufox browser ready"
else
  # Fallback: attempt runtime download if somehow missing
  echo "Warning: Camoufox browser not found, attempting download..."
  mkdir -p "$HOME/.cache/camoufox"
  if ./node_modules/.bin/camoufox-js fetch; then
    echo "Camoufox browser installed successfully"
  else
    echo "Warning: Failed to download Camoufox browser. Captcha solving will be unavailable."
  fi
fi

echo "Starting Cinephage..."
exec "$@"
