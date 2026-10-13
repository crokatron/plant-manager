#!/bin/bash
set -euo pipefail
umask 077
BASE=/mnt/cache_nvme/appdata/mungoon-plants
SOURCE=$(cd -- "$(dirname -- "$0")" && pwd)
if [ -e "$BASE/installed.json" ] || docker container inspect mungoon-plants-db >/dev/null 2>&1; then
  echo 'Existing plant installation found; refusing to replace it.' >&2
  exit 1
fi
for image in ghcr.io/danielbrendel/hortusfox-web:v6.2 mariadb:11.4 nginx:1.28-alpine python:3.12-alpine; do
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
done
mkdir -p "$BASE/private" "$BASE/config" "$BASE/database" "$BASE/reminders" "$BASE/app"/{img,attachments,logs,backup,themes,migrations}
cp "$SOURCE/nginx.conf" "$BASE/config/nginx.conf"
cp "$SOURCE/reminders.py" "$BASE/config/reminders.py"
cp "$SOURCE/bootstrap.php" "$BASE/config/bootstrap.php"
cp "$SOURCE/start-plants.sh" "$SOURCE/run-plants.sh" "$BASE/config/"
chmod 755 "$BASE/config"
chmod 644 "$BASE/config/"*
chown 99:100 "$BASE/reminders"
openssl rand -hex 32 > "$BASE/private/db-password"
openssl rand -hex 32 > "$BASE/private/db-root-password"
openssl rand -hex 32 > "$BASE/private/admin-password"
openssl rand -hex 32 > "$BASE/private/cron-password"
{
  printf 'MARIADB_DATABASE=hortusfox\nMARIADB_USER=hortusfox\nMARIADB_PASSWORD='
  cat "$BASE/private/db-password"
  printf 'MARIADB_ROOT_PASSWORD='
  cat "$BASE/private/db-root-password"
  printf 'TZ=Asia/Dubai\n'
} > "$BASE/private/database.env"
docker network inspect mungoon-plants-db-net >/dev/null 2>&1 || docker network create --internal mungoon-plants-db-net >/dev/null
docker network inspect mungoon-plants-front >/dev/null 2>&1 || docker network create mungoon-plants-front >/dev/null
docker create --name mungoon-plants-db --network mungoon-plants-db-net --restart unless-stopped \
  --memory 512m --cpus 1 --pids-limit 256 \
  --env-file "$BASE/private/database.env" -v "$BASE/database:/var/lib/mysql" \
  --label net.unraid.docker.managed=dockerman mariadb:11.4 >/dev/null
docker start mungoon-plants-db >/dev/null
docker create --name mungoon-plants-gateway --network mungoon-plants-front --restart unless-stopped \
  --memory 128m --cpus 1 --pids-limit 100 --user 101:101 --read-only \
  --security-opt no-new-privileges --cap-drop ALL --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -p 127.0.0.1:9073:8080 -v "$BASE/config/nginx.conf:/etc/nginx/nginx.conf:ro" \
  --label net.unraid.docker.managed=dockerman \
  --label net.unraid.docker.webui=https://plants.mungoon.net \
  nginx:1.28-alpine nginx -g 'daemon off;' >/dev/null
# HortusFox has no published port; the gateway supplies identity only after auth.
{
  printf 'APP_ADMIN_EMAIL=lamont.leras@gmail.com\nAPP_ADMIN_PASSWORD='
  cat "$BASE/private/admin-password"
  printf 'APP_CRON_PW='
  cat "$BASE/private/cron-password"
  printf 'APP_TIMEZONE=Asia/Dubai\nAPP_WORKSPACE=Mungoon Plants\nAPP_DEBUG=false\nAPP_UPDATEDEPS=false\n'
  printf 'DB_HOST=mungoon-plants-db\nDB_PORT=3306\nDB_DATABASE=hortusfox\nDB_USERNAME=hortusfox\nDB_PASSWORD='
  cat "$BASE/private/db-password"
  printf 'DB_CHARSET=utf8mb4\nPROXY_ENABLE=true\nPROXY_HEADER_EMAIL=X-Mungoon-Email\nPROXY_HEADER_USERNAME=X-Mungoon-Name\nPROXY_AUTO_SIGNUP=false\nPROXY_HIDE_LOGOUT=true\nPROXY_OVERWRITE_VALUES=true\nAPACHE_SERVER_NAME=plants.mungoon.net\n'
} > "$BASE/private/web.env"
docker create --name mungoon-plants-web --network mungoon-plants-front --restart unless-stopped \
  --memory 768m --cpus 2 --pids-limit 256 --security-opt no-new-privileges \
  --env-file "$BASE/private/web.env" \
  -v "$BASE/app/img:/var/www/html/public/img" -v "$BASE/app/attachments:/var/www/html/public/attachments" \
  -v "$BASE/app/logs:/var/www/html/app/logs" -v "$BASE/app/backup:/var/www/html/public/backup" \
  -v "$BASE/app/themes:/var/www/html/public/themes" -v "$BASE/app/migrations:/var/www/html/app/migrations" \
  -v "$BASE/config/bootstrap.php:/opt/plant-bootstrap.php:ro" \
  -v "$BASE/config/start-plants.sh:/opt/start-plants.sh:ro" -v "$BASE/config/run-plants.sh:/opt/run-plants.sh:ro" \
  --label net.unraid.docker.managed=dockerman --label net.unraid.docker.webui=https://plants.mungoon.net \
  --entrypoint /bin/bash ghcr.io/danielbrendel/hortusfox-web:v6.2 /opt/start-plants.sh >/dev/null
docker network connect mungoon-plants-db-net mungoon-plants-web
docker start mungoon-plants-web >/dev/null
ready=0
for attempt in $(seq 1 90); do
  if docker exec mungoon-plants-web php -r 'try {$p=new PDO("mysql:host=".getenv("DB_HOST").";dbname=hortusfox",getenv("DB_USERNAME"),getenv("DB_PASSWORD")); exit($p->query("SELECT COUNT(*) FROM UserModel WHERE admin=1")->fetchColumn()>0 && @file_get_contents("http://127.0.0.1/",false,stream_context_create(["http"=>["header"=>["X-Mungoon-Email: lamont.leras@gmail.com","X-Mungoon-Name: Lamont"]]]))!==false ? 0:1);}catch(Throwable $e){exit(1);}' >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || { echo 'HortusFox did not become ready; public gateway remains stopped.'; exit 1; }
docker exec mungoon-plants-web php /opt/plant-bootstrap.php > "$BASE/private/plants.json"
chown 99:100 "$BASE/private/plants.json"
chmod 600 "$BASE/private/plants.json"
docker start mungoon-plants-gateway >/dev/null
docker exec mungoon-plants-gateway nginx -t
# This isolated worker only reads the existing HA connection and sends configured
# care notifications. It has no ports, Docker socket, or general NAS share access.
cp /mnt/user/appdata/mungoon-projects/data/private/home-assistant.json "$BASE/private/home-assistant.json"
chown 99:100 "$BASE/private/home-assistant.json"
chmod 600 "$BASE/private/home-assistant.json"
docker create --name mungoon-plants-reminders --network mungoon-plants-front --restart unless-stopped \
  --memory 128m --cpus 0.5 --pids-limit 64 --user 99:100 --read-only \
  --security-opt no-new-privileges --cap-drop ALL --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONUNBUFFERED=1 \
  -v "$BASE/config/reminders.py:/app/reminders.py:ro" -v "$BASE/reminders:/data" \
  -v "$BASE/private/plants.json:/run/secrets/plants.json:ro" \
  -v "$BASE/private/home-assistant.json:/run/secrets/home-assistant.json:ro" \
  --label net.unraid.docker.managed=dockerman python:3.12-alpine python /app/reminders.py >/dev/null
docker start mungoon-plants-reminders >/dev/null
docker exec mungoon-plants-reminders python /app/reminders.py --targets
docker exec mungoon-plants-reminders python /app/reminders.py --once
docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/danielbrendel/hortusfox-web:v6.2 mariadb:11.4 nginx:1.28-alpine python:3.12-alpine > "$BASE/image-digests.txt"
printf '{"version":"6.2","created":"%s","public":false}\n' "$(date -u +%FT%TZ)" > "$BASE/installed.json"
cp -a /var/lib/docker/unraid-autostart "$BASE/autostart-before.cfg"
for name in mungoon-plants-db mungoon-plants-web mungoon-plants-gateway mungoon-plants-reminders; do
  grep -q "^${name} " /var/lib/docker/unraid-autostart || printf '%s 0\n' "$name" >> /var/lib/docker/unraid-autostart
done
echo 'Plant manager installed. Gateway is loopback-only, awaiting protected Cloudflare routing.'
