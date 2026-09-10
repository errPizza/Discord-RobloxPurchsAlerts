# Another Game More — Raspberry Pi local

Aplicación autónoma con Node.js, Fastify y SQLite. Cloudflare no forma parte del runtime: el Cloudflare Tunnel ya existente debe apuntar a `http://127.0.0.1:8787`.

```text
Internet → Cloudflare Tunnel → 127.0.0.1:8787 → Node.js/Fastify → SQLite
                                                        │
                                      /mnt/appdata      │      /mnt/backups
```

No se usa Cloudflare Workers, D1, KV, Durable Objects, R2, Wrangler ni rate limiting de Cloudflare. Nginx tampoco es necesario: el túnel alcanza Node directamente.

## Despliegue inicial

Requisitos: Raspberry Pi ARM64 con Docker Compose v2, los SSD montados en `/mnt/appdata` y `/mnt/backups`, y el túnel configurado.

```bash
sudo install -d -m 0750 -o 1000 -g 1000 /mnt/appdata /mnt/backups
git clone https://github.com/errPizza/Discord-RobloxPurchsAlerts.git
cd Discord-RobloxPurchsAlerts
cp .env.example .env
chmod 600 .env
# Completa .env antes de continuar.
docker compose up -d --build
curl -f http://127.0.0.1:8787/health
curl -f http://127.0.0.1:8787/ready
```

Compose utiliza `network_mode: host`, por lo que Node escucha realmente en `127.0.0.1:8787` y no se publica un puerto Docker en otras interfaces. `/mnt/appdata` y `/mnt/backups` sobreviven a reconstrucciones, reinicios y `docker compose down`.

Crea después la primera y única cuenta owner:

```bash
docker compose exec app node server/scripts/create-owner.js tu-correo@ejemplo.com
```

El script pide la contraseña, crea la SQLite si hace falta y se niega a crear un segundo owner. Esa cuenta puede promover miembros a `admin` desde el panel web.

## Configurar `.env`

Parte siempre de `.env.example`; `.env` está ignorado por Git. No hay secretos dentro de Dockerfile, Compose ni código.

| Variables | Valor o uso |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | Producción: `production`, `127.0.0.1`, `8787`. |
| `DATABASE_PATH`, `BACKUP_PATH`, `STATIC_ROOT`, `STATIC_SOURCE_PATH` | Mantén los valores del ejemplo dentro del contenedor. Se mapean a los SSD. |
| `PUBLIC_ORIGIN` | `https://www.anothergamemore.online`. Es obligatorio para OAuth y validación same-origin. |
| `COOKIE_SECURE` | `auto` permite HTTPS público y pruebas HTTP locales. |
| `SESSION_SECRET`, `PASSWORD_PEPPER` | Obligatorios, aleatorios y de al menos 32 bytes. No cambies el pepper tras crear usuarios. |
| `MOBILE_ACCESS_TOKEN_SECRET`, `MOBILE_REFRESH_TOKEN_SECRET` | Dos secretos distintos para la app móvil. |
| `DONATION_SECRET`, `ITEMS_SECRET`, `STATS_SECRET`, `BOMBGAME_SECRET` | Conservan los nombres actuales que consumen los webhooks Roblox. Escribe tus valores. |
| `DONATION_WEBHOOK`, `SINGLE_ITEM_WEBHOOK`, `BULK_ITEMS_WEBHOOK`, `STATS_WEBHOOK` | URLs webhook Discord. Vacío desactiva ese aviso. |
| `REQUIRE_SIGNED_WEBHOOKS` | Recomendado `true`; requiere `X-AGM-Timestamp`, `X-AGM-Nonce` y `X-AGM-Signature` HMAC. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Opcionales. Callbacks: `/api/auth/oauth/google/callback` y `/api/auth/oauth/discord/callback`. |
| `DOCKER_*`, `AGM_SOCKET_GID` | Déjalos desactivados hasta instalar el proxy Docker restringido. `DOCKER_ALLOWED_CONTAINERS` es una allowlist de IDs separados por comas y `AGM_SOCKET_GID` debe ser el GID numérico del grupo host `agmapp` si se montan sockets. |
| `NGINX_ENABLED`, `HOST_CONTROL_*` | `false` hasta instalar el helper de host; nunca se usa shell desde HTTP. |
| `BACKUP_*` | El ejemplo hace backup cada `24h` y conserva 14. Admite `ms`, `s`, `m`, `h`, `d`. |
| `REQUEST_LOG_RETENTION_DAYS`, `ALERT_*` | Retención de observabilidad y umbrales; `0` desactiva un umbral. |

Genera un secreto con:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Datos, SQLite y backups

```text
/mnt/appdata/
├── database.sqlite
├── database.sqlite-wal
├── database.sqlite-shm
└── web/

/mnt/backups/
└── database-YYYY-MM-DDTHH-MM-SS-sssZ.sqlite
```

SQLite activa WAL, foreign keys, `busy_timeout=5000`, `synchronous=NORMAL`, índices y transacciones. No copies sólo `database.sqlite` mientras está activo. Usa el mecanismo consistente:

```bash
docker compose exec app node server/scripts/backup.js
ls -lah /mnt/backups
```

Para restaurar, detén el contenedor, conserva una copia de la base actual, sustituye la base por un backup, borra sólo los WAL/SHM antiguos y arranca de nuevo:

```bash
docker compose down
sudo cp -a /mnt/appdata/database.sqlite /mnt/backups/database-before-restore.sqlite
sudo cp /mnt/backups/database-AAAA-MM-DDTHH-MM-SS-sssZ.sqlite /mnt/appdata/database.sqlite
sudo rm -f /mnt/appdata/database.sqlite-wal /mnt/appdata/database.sqlite-shm
docker compose up -d
```

La instalación es limpia: no importa cuentas antiguas. Si alguna vez necesitas datos D1, el importador acepta SQL/JSON, se detiene si la base destino tiene datos y jamás borra ni sobrescribe automáticamente:

```bash
docker compose exec app node server/scripts/import-d1.js --input /app/data/export.sql
```

Haz un backup antes de importar. Las sesiones antiguas no son útiles si los secretos cambiaron.

## API

Se mantienen las rutas web y Roblox: `/api/site`, `/api/status`, `/api/auth/*`, `/api/admin/*`, `/games/Clothing/*`, `/games/Missile/*`, `/health` y `/ready`. Los webhooks validan tamaño, JSON, secret con comparación de tiempo constante, firma, deduplicación y rate limit local.

La API móvil usa `/api/mobile/*`:

- Auth: `/auth/login`, `/auth/refresh`, `/auth/logout`.
- Sesiones: `/sessions`, `/:id/approve`, `/:id/revoke`.
- Monitor: `/system`, `/power`, `/requests`, `/errors`, `/logs`, `/statistics`, `/application`, `/server/status`.
- Infraestructura: `/docker`, `/:id/start`, `/:id/stop`, `/:id/restart`, `/nginx`, `/nginx/reload`, `/nginx/restart`, `/server/restart`, `/server/shutdown`.
- Alertas: `/alerts`, `/:id/acknowledge`.

El primer login móvil crea una sesión `pending`; no entrega tokens ni información sensible. Un admin/owner debe aprobarla. Para arrancar el primer móvil, inicia sesión owner en la web y usa `GET /api/admin/mobile/sessions` y `POST /api/admin/mobile/sessions/:id/approve`. Access tokens duran 15 minutos; refresh tokens son revocables, se ligan al dispositivo y rotan en cada uso.

Permisos: `MONITOR_READ`, `LOGS_READ`, `DOCKER_READ`, `NGINX_READ`, `STATS_READ`, `ALERTS_READ`, `REMOTE_CONTROL`, `DOCKER_CONTROL`, `NGINX_CONTROL` y `SERVER_CONTROL`. Owner tiene todos; admin tiene lectura. Cada operación se audita en SQLite. Energía devuelve `{ "available": false }` sin sensor real; nunca inventa valores.

## Docker y control del host opcionales

El contenedor nunca monta el socket Docker directamente. Para activar Docker, instala primero `ops/agm-docker-proxy.service`, que sólo permite listar, inspeccionar, stats, start, stop y restart:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin agmproxy || true
sudo groupadd --system agmapp || true
sudo usermod -aG agmapp agmproxy
sudo install -d -m 0750 -o root -g agmapp /opt/another-game-more
sudo cp -a ops /opt/another-game-more/
sudo cp ops/agm-docker-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agm-docker-proxy.service
```

Descomenta el mount del proxy en Compose, define `DOCKER_ENABLED=true`, la allowlist y `AGM_SOCKET_GID=$(getent group agmapp | cut -d: -f3)` en `.env`. El proxy rechaza `exec`, comandos, creación/borrado de contenedores, imágenes y volúmenes.

Reinicio/apagado y control Nginx requieren `ops/agm-host-control.service`. Instálalo por separado, crea `/etc/another-game-more/host-control.env` con `HOST_CONTROL_SECRET=...` modo `0600`, y luego activa el mount del socket y `HOST_CONTROL_ENABLED=true`. El helper acepta exclusivamente cuatro acciones firmadas con HMAC y nonce: `restart`, `shutdown`, `nginx-reload`, `nginx-restart`.

## Desarrollo y validación

```bash
npm install
npm run build
npm test
npm run dev
curl http://127.0.0.1:8787/health
```

Antes de actualizar la Raspberry:

```bash
docker compose build --no-cache
docker compose up -d
docker compose logs --tail=100 app
curl -f http://127.0.0.1:8787/health
curl -f http://127.0.0.1:8787/ready
```
