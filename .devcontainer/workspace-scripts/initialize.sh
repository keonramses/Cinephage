#!/usr/bin/env sh

cd .devcontainer
mkdir -p downloads/incomplete media config/transmission config/qbittorrent config/sabnzbd

PUID=$(id -u)
PGID=$(id -g)

touch .env

if grep -qE '^[[:space:]]*PUID=' .env; then
  sed -i "s|^[[:space:]]*PUID=.*$|PUID=$PUID|" .env
else
  echo "PUID=$PUID" >> .env
fi

if grep -qE '^[[:space:]]*PGID=' .env; then
  sed -i "s|^[[:space:]]*PGID=.*$|PGID=$PGID|" .env
else
  echo "PGID=$PGID" >> .env
fi
