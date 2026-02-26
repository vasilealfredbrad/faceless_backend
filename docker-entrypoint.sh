#!/bin/sh
set -e
# Fix permissions on mounted volumes (bind mounts inherit host ownership, appuser needs write access)
mkdir -p /app/generated /app/videos
chown -R appuser:appuser /app/generated /app/videos
exec gosu appuser "$@"
