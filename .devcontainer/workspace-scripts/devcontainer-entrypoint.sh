#!/usr/bin/env sh

set -eu

if [ "$(id -u)" = "0" ]; then
	NODE_UID="$(id -u node)"
	NODE_GID="$(id -g node)"

	# Keep VS Code's remote user home writable.
	chown -R "$NODE_UID:$NODE_GID" /home/node 2>/dev/null || true

	# Fix bind-mounted workspace ownership only when mismatches are present.
	if [ -d '/workspace' ] && find /workspace \( ! -uid "$NODE_UID" -o ! -gid "$NODE_GID" \) -print -quit | grep -q .; then
		chown -R "$NODE_UID:$NODE_GID" /workspace 2>/dev/null || true
	fi

	# Ensure Camoufox binary is executable (required in some container filesystems).
	if [ -f '/home/node/.cache/camoufox/camoufox-bin' ]; then
		chmod +x '/home/node/.cache/camoufox/camoufox-bin' 2>/dev/null || true
	fi
fi

exec "$@"
