#!/bin/bash
set -euo pipefail
BASE=/mnt/cache_nvme/appdata/mungoon-plants
SOURCE=$(cd "$(dirname "$0")" && pwd)
test -s "$BASE/private/plants.json"
test -s "$SOURCE/floor-plan.json"
if docker container inspect mungoon-plants-map >/dev/null 2>&1; then
  echo 'Plant map already exists. Use the verified update procedure; refusing to replace its data.' >&2
  exit 1
fi
mkdir -p "$BASE/plant-map" "$BASE/config/map-backups"
if [ ! -e "$BASE/plant-map/floor-plan.json" ]; then cp "$SOURCE/floor-plan.json" "$BASE/plant-map/floor-plan.json"; fi
chown 99:100 "$BASE/plant-map" "$BASE/plant-map/floor-plan.json"
chmod 700 "$BASE/plant-map"
chmod 600 "$BASE/plant-map/floor-plan.json"
docker run --rm --network none -v "$SOURCE:/app:ro" --tmpfs /tmp python:3.12-alpine python -c "import ast,pathlib;[ast.parse(p.read_text()) for p in pathlib.Path('/app').glob('*.py')];print('Python sources valid')"
docker create --name mungoon-plants-map --network mungoon-plants-front --restart unless-stopped \
 --memory 256m --cpus 0.5 --pids-limit 64 --user 99:100 --read-only --security-opt no-new-privileges --cap-drop ALL \
 --tmpfs /tmp:rw,noexec,nosuid,size=16m -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONUNBUFFERED=1 \
 -v "$SOURCE:/app:ro" -v "$BASE/plant-map:/data" -v "$BASE/private/plants.json:/run/secrets/plants.json:ro" \
 --label net.unraid.docker.managed=dockerman --label net.unraid.docker.webui=https://plants.mungoon.net/plant-map/ \
 python:3.12-alpine python /app/server.py >/dev/null
docker start mungoon-plants-map >/dev/null
docker exec mungoon-plants-map python -c "import sys;sys.path.insert(0,'/app');from server import App;print('Collection readable:',len(App().state()['plants']))"
docker run --rm --network mungoon-plants-front --entrypoint nginx -v "$SOURCE/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.28-alpine -t
BACKUP="$BASE/config/map-backups/nginx-before-map-$(date +%Y%m%d-%H%M%S).conf"
cp -p "$BASE/config/nginx.conf" "$BACKUP"
cat "$SOURCE/nginx.conf" > "$BASE/config/nginx.conf"
if ! docker exec mungoon-plants-gateway nginx -t || ! docker exec mungoon-plants-gateway nginx -s reload; then
 cat "$BACKUP" > "$BASE/config/nginx.conf"
 docker exec mungoon-plants-gateway nginx -s reload
 echo 'Gateway update failed; original restored.' >&2
 exit 1
fi
# Keep the existing refresh credential on the direct cache filesystem. The Projects
# service atomically replaces its credential file, invalidating a file bind on FUSE.
if [ ! -s "$BASE/private/home-assistant.json" ]; then
 cp /mnt/user/appdata/mungoon-projects/data/private/home-assistant.json "$BASE/private/home-assistant.json"
 chown 99:100 "$BASE/private/home-assistant.json"
 chmod 600 "$BASE/private/home-assistant.json"
fi
docker create --name mungoon-plants-map-sync --network mungoon-plants-front --restart unless-stopped \
 --memory 256m --cpus 0.5 --pids-limit 64 --user 99:100 --read-only --security-opt no-new-privileges --cap-drop ALL \
 --tmpfs /tmp:rw,noexec,nosuid,size=16m -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONUNBUFFERED=1 \
 -v "$SOURCE:/app:ro" -v "$BASE/plant-map:/data" -v "$BASE/private/plants.json:/run/secrets/plants.json:ro" \
 -v "$BASE/private/home-assistant.json:/run/secrets/home-assistant.json:ro" \
 --label net.unraid.docker.managed=dockerman python:3.12-alpine python /app/sync_ha.py >/dev/null
touch /var/lib/docker/unraid-autostart
for name in mungoon-plants-map mungoon-plants-map-sync; do
 grep -qE "^${name}([[:space:]]|$)" /var/lib/docker/unraid-autostart || printf '%s\n' "$name" >> /var/lib/docker/unraid-autostart
done
echo 'Plant map deployed. Photo import and HA sync startup are separate verified steps.'
