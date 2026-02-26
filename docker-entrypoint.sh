#!/bin/sh
set -e

# Create render/video groups matching host GIDs and add appuser
groupadd -g 991 render 2>/dev/null || true
groupadd -g 44 video 2>/dev/null || true
usermod -aG render,video appuser 2>/dev/null || true

# Fix permissions on mounted volumes
mkdir -p /app/generated /app/videos /app/yt_download_raw
mkdir -p /app/videos/minecraft/30 /app/videos/minecraft/60
chown -R appuser:appuser /app/generated /app/videos /app/yt_download_raw
chmod -R 775 /app/generated /app/videos /app/yt_download_raw

exec gosu appuser "$@"
