#!/bin/sh
set -e
# Fix permissions on mounted volumes (bind mounts inherit host ownership, appuser needs write access)
mkdir -p /app/generated /app/videos /app/yt_download_raw
mkdir -p /app/videos/minecraft/30 /app/videos/minecraft/60
chown -R appuser:appuser /app/generated /app/videos /app/yt_download_raw
chmod -R 775 /app/generated /app/videos /app/yt_download_raw
exec gosu appuser "$@"
