# Another Game More | WEB — Raspberry Pi(server/hoster) local

Aplicación autónoma con Node.js, Fastify y SQLite. Cloudflare no forma parte del runtime: el Cloudflare Tunnel ya existente debe apuntar a `http://127.0.0.1:8787`.

## Índice

- [Arquitectura y flujos](#arquitectura-y-flujos)
- [La interfaz y sus rutas](#la-interfaz-y-sus-rutas)
- [Despliegue inicial](#despliegue-inicial)
- [Configurar `.env`](#configurar-env)
- [Datos, SQLite y backups](#datos-sqlite-y-backups)
- [API web y administración](#api-web-y-administración)
- [Roblox, estadísticas y Discord](#roblox-estadísticas-y-discord)
- [OAuth y callbacks](#oauth-y-callbacks)
- [API móvil y permisos](#api-móvil-y-permisos)
- [Código y personalización](#código-y-personalización)
- [Operación, actualización y problemas](#operación-actualización-y-problemas)
- [Reglas de seguridad](#reglas-de-seguridad)

```text
Internet → Cloudflare Tunnel → 127.0.0.1:8787 → Node.js/Fastify → SQLite
                                                        │
                                      /mnt/appdata      │      /mnt/backups
```

No se usa Cloudflare Workers, D1, KV, Durable Objects, R2, Wrangler ni rate limiting de Cloudflare. Nginx tampoco es necesario: el túnel alcanza Node directamente.

## Inicio rápido

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


## Arquitectura y flujos

### Qué contiene y cómo funciona

La aplicación conserva la web pública y el panel administrativo de Another Game More, la recepción de compras desde Roblox, las estadísticas, los mensajes Discord y los callbacks OAuth. Cambió únicamente la infraestructura que los ejecuta:

| Función | Implementación actual |
| --- | --- |
| Interfaz | React 19, React Router y Vite. |
| API | Node.js 22+, Fastify, cookies y WebSocket. |
| Datos | SQLite local mediante better-sqlite3. |
| Archivos web | Build de Vite servido por Fastify con fallback SPA. |
| Exposición HTTPS | Cloudflare Tunnel ya existente hacia 127.0.0.1:8787. |
| Integraciones | Roblox Thumbnails/Users y Discord Webhooks. |
| Tareas | Timer interno Node para resumen semanal; timer para backups y retención. |

~~~text
Internet ── HTTPS ──> Cloudflare Tunnel ── HTTP local ──> Node/Fastify
Roblox ─────────────────────────────────────────────────> Node/Fastify
                                                              │
                                           /mnt/appdata <─────┼──> SQLite + build web
                                           /mnt/backups <─────┘
                                                              │
                                                   Discord / Roblox APIs
~~~

Cloudflare Tunnel no guarda datos ni ejecuta lógica de negocio. No existen bindings Cloudflare, D1, KV, Workers, Durable Objects, R2 ni Wrangler en esta versión. Nginx tampoco es necesario para servir la web: el túnel llega directamente a Node.

### Flujo de contenido, sesión y dashboard

1. Fastify sirve el build React y responde index.html para toda ruta GET no API; por ello /dashboard y sus subrutas funcionan también al recargar.
2. Home consulta GET /api/site para textos, contactos visibles y avatares actuales de Roblox. Si la API no responde, React usa valores fallback incluidos en Home.jsx y ContactGrid.jsx.
3. AuthProvider consulta GET /api/auth/session al cargar. La cookie se verifica contra la sesión hasheada que hay en SQLite.
4. DashboardLayout permite el panel sólo a admin y owner. Cada endpoint administrativo repite la comprobación en backend.
5. GamesDashboard consulta estadísticas por juego y mantiene un WebSocket en /api/admin/games/events para refrescar al entrar un evento local.

### Flujo de una compra o donación

Roblox realiza dos operaciones independientes para Clothing:

1. POST /games/Clothing/stats registra estadísticas en SQLite.
2. POST /games/Clothing/donation, /item o /bulk crea el aviso visual de Discord.

Pausar los avisos Discord o bloquear un UserId afecta sólo la segunda operación. Las estadísticas de /stats siguen sumándose.

~~~text
POST Roblox
   │
   ├─ secret + HMAC + timestamp + nonce inválidos ──> 401
   ├─ nonce/eventId repetido ───────────────────────> 200 duplicate
   ├─ /stats ──> transacción SQLite (daily + weekly + game event)
   │                 └─> notificación WebSocket local para Games
   └─ mensaje ──> ¿worker_enabled? ──> ¿UserId bloqueado?
                      │ no                 │ sí
                      └─> 200 sin Discord  └─> 200 sin Discord
                                      │
                                      └─> imágenes Roblox + embed + webhook Discord
~~~

Las cuatro rutas Missile sólo almacenan sus eventos y métricas. Nunca envían un mensaje Discord.

### Acceso y roles

- Registro por correo: crea una cuenta member.
- Google o Discord: valida un perfil con correo verificado, enlaza o crea una cuenta member y conserva la identidad OAuth en SQLite.
- Sesión web: token aleatorio hasheado, asociado al hash del User-Agent y con expiración de siete días. La cookie agm_session es HttpOnly y SameSite=Lax; es Secure cuando la petición es HTTPS con COOKIE_SECURE=auto.
- Owner: todos los permisos, incluida promoción, borrado de miembros/admins y control remoto móvil opcional.
- Admin: dashboard, estadísticas, blocklist y lectura de monitorización; no obtiene las acciones exclusivas de owner.
- Member: página pública, sin dashboard administrativo.

La contraseña se deriva con PBKDF2-SHA256, 310 000 iteraciones, salt único y PASSWORD_PEPPER. Tras ocho intentos fallidos para un correo dentro de 15 minutos, el correo queda bloqueado durante 15 minutos.

### Resumen semanal y backups

- Node calcula el siguiente lunes a las 06:00 UTC y programa la tarea.
- Si worker_enabled no es 0, STATS_WEBHOOK existe y todavía no se publicó esa semana, se envía el resumen de la semana anterior.
- last_weekly_summary_week evita duplicarlo aunque el proceso se reinicie.
- El backup automático se realiza cada BACKUP_INTERVAL. Usa la API de copia de SQLite, ejecuta integrity_check y conserva sólo BACKUP_RETENTION copias.

## La interfaz y sus rutas

La apariencia sigue siendo la del frontend React original: logo, fondos, animaciones, landing, login, dashboard y gráficas viven en frontend/src. La diferencia visual intencional es que el bloque CAPTCHA Turnstile ya no aparece, porque dependía de Cloudflare.

| URL | Vista | Acceso | Qué permite |
| --- | --- | --- | --- |
| / | Home | Público | Hero, About, Games, directorio del equipo y comunidad. |
| /login | Login | Público | Inicio por correo, proveedores OAuth y mensajes de callback. |
| /signup | Signup | Público | Registro y requisitos de contraseña. |
| /dashboard | Dashboard | Admin/owner | Resúmenes semanal, mensual y global. |
| /dashboard/stats | Stats | Admin/owner | Elegir y sustituir métricas de una semana. |
| /dashboard/games | GamesDashboard | Admin/owner | Clothing y Missile: en vivo, 24 h, 7 d y 30 d. |
| /dashboard/worker | WorkerControl | Admin/owner | Pausa Discord, bloquea UserIds y consulta perfiles Roblox. |
| /dashboard/database | Database | Admin/owner | Conteos SQLite y registro de semana actual. |
| /dashboard/promote | Promote | Owner | Buscar, promover y eliminar usuarios que no sean owner. |
| cualquier otra | NotFound | Público | Página 404. |

La portada obtiene estas settings persistentes de SQLite:

- studio_name
- hero_description
- about_description
- worker_enabled

El directorio de equipo usa contacts con team_group, display_order, is_visible, roblox_user_id, roblox_url, discord_username, joined_at e image_key. Los grupos visuales son owner, co_owners, developers, contributors y testers; el contacto con team_group community representa los enlaces oficiales.

## OAuth y callbacks

La ruta del callback se forma a partir de PUBLIC_ORIGIN. Debe ser exactamente la misma URL HTTPS que registraste en cada proveedor.

| Proveedor | Inicio | Callback |
| --- | --- | --- |
| Google | GET /api/auth/oauth/google | https://www.anothergamemore.online/api/auth/oauth/google/callback |
| Discord | GET /api/auth/oauth/discord | https://www.anothergamemore.online/api/auth/oauth/discord/callback |

Si el dominio cambia, reemplaza el ejemplo por PUBLIC_ORIGIN + la ruta mostrada. Los botones se activan sólo cuando el Client ID y Client Secret de ese proveedor están presentes.

El inicio OAuth crea una cookie temporal firmada con provider, state, redirect URI y expiración de diez minutos. El callback valida state, intercambia code, consulta el perfil y requiere correo verificado. En éxito crea la sesión web y redirige a /dashboard para admin/owner o a / para member. Cualquier state, code, token o perfil inválido limpia el intento y redirige a /login?auth_error=oauth_failed.

Los callbacks pueden probarse de extremo a extremo sólo después de definir los secretos en .env y tener la URL pública activa; sus rutas, respuesta y redirecciones ya están implementadas.

+
## API web y administración

Todas las respuestas de error son JSON. Las mutaciones web comprueban la sesión, same-origin y el límite local de requests; el control de acceso se verifica de nuevo en Fastify, aunque React oculte la vista.

### Salud y contenido público

| Método | Ruta | Auth | Qué devuelve |
| --- | --- | --- | --- |
| GET | /health | No | Liveness: status ok. |
| GET | /ready | No | SQLite consultable y directorio de base escribible. |
| GET | /api/site | No | Settings, contactos visibles y avatares Roblox. |
| GET | /api/status | No | Nombre, estado online/paused y mensajes habilitados. |

### Autenticación

| Método | Ruta | Función |
| --- | --- | --- |
| GET | /api/auth/session | Usuario de sesión o flags isAdmin/isOwner vacíos. |
| GET | /api/auth/providers | Disponibilidad booleana de Google y Discord. |
| POST | /api/auth/signup | Valida correo/contraseña, crea member e inicia sesión. |
| POST | /api/auth/login | Verifica credenciales e inicia sesión. |
| POST | /api/auth/logout | Revoca la sesión SQLite y limpia la cookie. |
| GET | /api/auth/oauth/google | Inicia Google OAuth. |
| GET | /api/auth/oauth/google/callback | Completa Google OAuth. |
| GET | /api/auth/oauth/discord | Inicia Discord OAuth. |
| GET | /api/auth/oauth/discord/callback | Completa Discord OAuth. |

El cuerpo para signup contiene email, password y passwordConfirmation. Login requiere email y password. Todos los cuerpos JSON deben ser objetos, nunca arrays.

### Dashboard administrativo

Requieren admin u owner, excepto Promote, que requiere owner. PUT, POST y DELETE requieren también origen permitido.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | /api/admin/analytics | Periodos semanal, mensual y global. |
| GET | /api/admin/stats?week=AAAA-WN | Semana elegida, lista de semanas y semana actual. |
| PUT | /api/admin/stats/:week | Sustituye spent, revenue, single, bulk y donations por enteros seguros no negativos. |
| GET | /api/admin/games?game=Clothing o Missile | Periodos live, last24Hours, last7Days y last30Days. |
| GET WebSocket | /api/admin/games/events?game=Clothing o Missile | Evento de refresco local de Games. |
| GET | /api/admin/worker | Lee worker_enabled. |
| PUT | /api/admin/worker | Activa o pausa sólo avisos Discord. |
| GET | /api/admin/worker/blocked-users | Lista UserIds excluidos de avisos. |
| POST | /api/admin/worker/blocked-users | Agrega UserId numérico positivo. |
| GET | /api/admin/worker/blocked-users/:userId/profile | Consulta perfil Roblox. |
| DELETE | /api/admin/worker/blocked-users/:userId | Retira el bloqueo. |
| GET | /api/admin/database | Motor SQLite, conteos y stats de la semana actual. |
| GET | /api/admin/promote/users?query=... | Busca hasta 50 usuarios. Owner. |
| GET | /api/admin/promote/users/:id | Detalle y sesiones del usuario. Owner. |
| PUT | /api/admin/promote/users/:id | Promueve a admin; no degrada owner. Owner. |
| DELETE | /api/admin/promote/users/:id | Elimina member/admin; no elimina owner. Owner. |
| GET | /api/admin/mobile/sessions | Lista solicitudes y dispositivos móviles. |
| POST | /api/admin/mobile/sessions/:id/approve | Aprueba dispositivo pendiente. |
| POST | /api/admin/mobile/sessions/:id/revoke | Revoca sesión y refresh tokens. |

## Roblox, estadísticas y Discord

### Rutas, secretos y compatibilidad

| Método | Ruta canónica | Secret | Resultado |
| --- | --- | --- | --- |
| POST | /games/Clothing/donation | DONATION_SECRET | Mensaje Discord de donación. |
| POST | /games/Clothing/item | ITEMS_SECRET | Mensaje Discord de compra individual. |
| POST | /games/Clothing/bulk | ITEMS_SECRET | Mensaje Discord de compra múltiple. |
| POST | /games/Clothing/stats | STATS_SECRET | Estadísticas y evento analítico Clothing. |
| POST | /games/Missile/DevProduct/Normal | BOMBGAME_SECRET | Evento Missile DevProduct normal. |
| POST | /games/Missile/DevProduct/Gift | BOMBGAME_SECRET | Evento Missile DevProduct regalado. |
| POST | /games/Missile/Gamepass/Normal | BOMBGAME_SECRET | Evento Missile Gamepass normal. |
| POST | /games/Missile/Gamepass/Gift | BOMBGAME_SECRET | Evento Missile Gamepass regalado. |

Los aliases históricos se mantienen sin cambiar servidores Roblox ya publicados:

| Alias POST | Equivale a |
| --- | --- |
| / | /games/Clothing/donation |
| /item | /games/Clothing/item |
| /bulk | /games/Clothing/bulk |
| /stats | /games/Clothing/stats |

### Firma, deduplicación y payload

Con REQUIRE_SIGNED_WEBHOOKS=true, además del secret se exigen estos headers:

~~~text
X-AGM-Timestamp: segundos Unix o milisegundos Unix
X-AGM-Nonce: identificador único de 16–128 caracteres A-Z, a-z, 0-9, _ o -
X-AGM-Signature: HMAC-SHA256 base64url de:
                 timestamp.nonce.<cuerpo JSON exacto>
~~~

La tolerancia de timestamp es cinco minutos. El nonce tiene prioridad como identificador del evento; si no hay firma, eventId puede usarse como dedupe. Un evento previamente reclamado devuelve éxito con duplicate: true y no vuelve a sumar ni a enviar Discord. REQUIRE_SIGNED_WEBHOOKS=false conserva la comprobación de secret, pero debe utilizarse sólo durante una transición controlada.

Contrato mínimo para estadísticas:

~~~json
{
  "secret": "STATS_SECRET",
  "eventId": "id-unico-del-evento",
  "type": "Donation",
  "amount": 100,
  "userId": "123456789"
}
~~~

~~~json
{
  "secret": "STATS_SECRET",
  "eventId": "id-unico-del-evento",
  "type": "Single",
  "price": 50,
  "creatorId": 802409113,
  "isPlusPlayer": false,
  "userId": "123456789"
}
~~~

~~~json
{
  "secret": "STATS_SECRET",
  "eventId": "id-unico-del-evento",
  "type": "Bulk",
  "items": [
    { "price": 50, "creatorId": 802409113 },
    { "price": 20, "creatorId": 1 }
  ],
  "isPlusPlayer": false,
  "userId": "123456789"
}
~~~

Stats acepta Donation, Single o Bulk. Donation requiere amount; Single, price y creatorId; Bulk acepta de 1 a 100 items. Los endpoints de mensaje validan displayName, username, UserId y sus datos visuales; bulk de mensaje se limita a 25 items por los límites de Discord.

### Cálculo de revenue y métricas

MY_CREATOR_ID está en server/services/stats.js y actualmente es 802409113.

| Tipo | Gastado | Revenue | Contador |
| --- | --- | --- | --- |
| Donation | amount | floor(amount × 0.70) | donations + 1 |
| Single del creador principal | precio normalizado | floor(precio × 0.70) | single + 1 |
| Single de otro creador | precio normalizado | floor(precio × 0.40) | single + 1 |
| Bulk | suma de items | 70 % o 40 % por item | bulk + 1 |

Si isPlusPlayer es true y el precio es al menos 10, se normaliza con round(valor / 0.9). Cada operación /stats usa una transacción que actualiza weekly_stats, daily_stats y game_stat_events.

### Discord y Roblox

| Evento | Variable Discord | Datos del embed |
| --- | --- | --- |
| Donación | DONATION_WEBHOOK | Persona, avatar, cantidad y número de donación. |
| Compra single | SINGLE_ITEM_WEBHOOK | Persona, avatar, miniatura, artículo, precio y número. |
| Compra bulk | BULK_ITEMS_WEBHOOK | Persona, avatar, artículos truncados y número. |
| Resumen semanal | STATS_WEBHOOK | Semana, gastado, revenue y compras. |

La app consulta avatars, item thumbnails, icono de grupo y perfiles mediante las APIs públicas Roblox. Si un webhook Discord está vacío, ese aviso no intenta enviar nada. Si Discord falla, el error se registra; las estadísticas continúan siendo independientes de la ruta visual.

## API móvil y permisos

La API móvil usa Authorization: Bearer <accessToken>. El primer login de un dispositivo nunca entrega tokens: crea una sesión pending y responde 202. Un admin/owner debe aprobarla desde el navegador mediante /api/admin/mobile/sessions o desde una sesión móvil admin/owner ya aprobada.

Access token dura 15 minutos. Refresh token dura 30 días, se guarda únicamente como SHA-256, se vincula a la sesión de dispositivo y se rota en cada refresh. Reutilizar un refresh ya rotado devuelve 401.

| Método | Ruta | Permiso o rol | Función |
| --- | --- | --- | --- |
| POST | /api/mobile/auth/login | Credenciales y deviceId/deviceName | Solicita o inicia sesión móvil. |
| POST | /api/mobile/auth/refresh | Refresh válido | Rota tokens. |
| POST | /api/mobile/auth/logout | Sesión móvil | Revoca refresh tokens del dispositivo. |
| GET | /api/mobile/sessions | Admin/owner | Lista solicitudes y sesiones. |
| POST | /api/mobile/sessions/:id/approve | Admin/owner | Aprueba dispositivo. |
| POST | /api/mobile/sessions/:id/revoke | Admin/owner | Revoca sesión y tokens. |
| GET | /api/mobile/system | MONITOR_READ | CPU, RAM, disco, red, temperatura y proceso. |
| GET | /api/mobile/power | MONITOR_READ | Sensor UPS/HAT/USB si existe. |
| GET | /api/mobile/requests | STATS_READ | Totales y buckets HTTP de la última hora. |
| GET | /api/mobile/errors | LOGS_READ | Logs ERROR/CRITICAL paginados. |
| GET | /api/mobile/logs | LOGS_READ | Logs por servicio, nivel, búsqueda, limit y offset. |
| GET | /api/mobile/docker | DOCKER_READ | Estado mediante proxy opcional. |
| POST | /api/mobile/docker/:id/start, stop o restart | DOCKER_CONTROL | Sólo una allowlist de IDs. |
| GET | /api/mobile/nginx | NGINX_READ | Disponibilidad de Nginx/helper. |
| POST | /api/mobile/nginx/reload o restart | NGINX_CONTROL | Solicitud HMAC al helper. |
| GET | /api/mobile/statistics | STATS_READ | Analytics globales y ambos juegos. |
| GET | /api/mobile/alerts | ALERTS_READ | Alertas paginadas. |
| POST | /api/mobile/alerts/:id/acknowledge | ALERTS_READ | Reconoce una alerta. |
| GET | /api/mobile/application | MONITOR_READ | Nombre, Node, uptime y motor SQLite. |
| GET | /api/mobile/server/status | MONITOR_READ | Snapshot y eventos de reinicio/apagado. |
| POST | /api/mobile/server/restart o shutdown | SERVER_CONTROL | Solicitud HMAC al helper root. |

| Rol | Permisos |
| --- | --- |
| member | Ninguno móvil administrativo. |
| admin | MONITOR_READ, LOGS_READ, DOCKER_READ, NGINX_READ, STATS_READ y ALERTS_READ; además puede gestionar sesiones. |
| owner | Todos, incluidos DOCKER_CONTROL, NGINX_CONTROL y SERVER_CONTROL. |

El snapshot de Linux no inventa datos: incluye CPU, RAM, disco del directorio de datos, red disponible, kernel, arquitectura, boot ID y proceso. Temperatura sólo se informa si existe el sensor del sistema. PowerMonitor responde available: false hasta que se integre un UPS, HAT, medidor USB o driver I²C real. Los umbrales se evalúan cada cinco minutos, se deduplican por 15 minutos y se guardan como alertas SQLite. Un cambio de boot ID queda registrado como reinicio espontáneo.

## Código y personalización

### Referencia backend

| Archivo | Responsabilidad |
| --- | --- |
| server/index.js | Fastify, parser JSON, cookies, WebSocket, headers de seguridad, health/ready, logs, SPA, scheduler, backups y retención. |
| server/config.js | Lee .env, rutas, flags, límites y duraciones. |
| server/routes/auth.js | Registro, login/logout, sesión y OAuth. |
| server/routes/admin.js | Dashboard, stats, Games, worker control, DB, Promote y sesiones móviles web. |
| server/routes/public.js | Webhooks Roblox, firma, dedupe, stats y Discord. |
| server/routes/mobile.js | Tokens móviles, monitorización, alertas y controles opcionales. |
| server/database/database.js | SQLite con WAL, FK, busy timeout y pragmas. |
| server/database/migrate.js | Migraciones SQL con checksum. |
| server/services/auth.js | Sesiones web, PBKDF2/OAuth y usuarios públicos. |
| server/services/security.js | Rate limit local, same-origin, secrets y HMAC webhook. |
| server/services/stats.js | Week Keys, revenue, stats, analytics y métricas Games. |
| server/services/game-events.js | Conexiones WebSocket locales por juego. |
| server/services/discord.js | Embeds y entrega Discord. |
| server/services/roblox.js | Avatares, thumbnails, grupo y perfiles. |
| server/services/backups.js | Backup consistente y rotación. |
| server/services/scheduler.js | Resumen semanal a lunes 06:00 UTC. |
| server/services/audit.js | Auditoría, logs de aplicación y alertas. |
| server/services/monitoring.js | Snapshot Linux, proxy Docker y helper host. |
| server/services/permissions.js | Permisos móviles por rol. |
| server/services/static-assets.js | Copia persistente del build web. |
| server/scripts/create-owner.js | Alta o actualización del único owner. |
| server/scripts/backup.js | Backup manual. |
| server/scripts/import-d1.js | Importación SQL/JSON sin sobrescritura. |

### Referencia frontend

| Archivo o componente | Responsabilidad |
| --- | --- |
| main.jsx y App.jsx | Montaje React, StrictMode, CSS, AuthProvider y router. |
| router/AppRouter.jsx | Rutas públicas, dashboard y 404. |
| contexts/AuthContext.jsx y hooks/useAuth.js | Sesión compartida, login, signup y logout. |
| services/api.js y auth.js | fetch con cookies, errores JSON, OAuth providers y WebSocket URL. |
| layouts/LandingLayout.jsx | Header, landing, footer y hashes. |
| layouts/DashboardLayout.jsx | Protección visual del dashboard y navegación. |
| components/landing | Hero, About, Games, equipo, links y assets públicos. |
| components/dashboard | Cards, selectors, METRICS y gráficas SVG. |
| pages/Home.jsx | Datos de sitio, fallbacks y reveals. |
| pages/Login.jsx y Signup.jsx | Formularios, OAuth y transiciones. |
| pages/Dashboard.jsx, Stats.jsx y GamesDashboard.jsx | Analytics, editor semanal y live game data. |
| pages/WorkerControl.jsx, Database.jsx y Promote.jsx | Discord control, overview SQLite y usuarios. |
| index.css | Colores, diseño responsive, animaciones y prefers-reduced-motion. |

### Cambios frecuentes

- Textos de portada: crea una migración para site_settings y ajusta los fallbacks de Home.jsx/ContactGrid.jsx.
- Equipo: actualiza contacts por migración. Usa is_visible=0 para ocultar antes de borrar; conserva display_order y team_group.
- Navbar: modifica el arreglo links de frontend/src/components/common/SiteHeader.jsx. Cada hash debe coincidir con un id de sección.
- Logros: modifica StatsBar dentro de Hero.jsx; los PNG están en frontend/src/assets/icons.
- Sobre nosotros/Juegos: estructura en About.jsx y Games.jsx; texto dinámico desde site_settings.
- Logo/fondos: frontend/src/assets/images. Ejecuta npm run build al cambiar assets.
- Estilos: frontend/src/index.css. Conserva la alternativa de prefers-reduced-motion.
- Métricas: cambia primero components/dashboard/metrics.js. Si se persiste una métrica nueva, añade migración SQLite, actualiza stats.js, gráficas, Stats.jsx y pruebas.
- Embeds Discord: server/services/discord.js. Un field Discord no puede superar 1024 caracteres.
- Revenue o creador: actualiza MY_CREATOR_ID y changesForStatsPayload, luego prueba Donation, Single y Bulk.
- Contraseñas: modifica passwordRequirements y la guía visual de Signup.jsx a la vez; backend sigue siendo la autoridad.
- Página dashboard: crea la página, registra Route, añade NavLink, protege la API en backend y escribe pruebas.
- Ruta API: selecciona routes/public.js, auth.js, admin.js o mobile.js; valida input y permisos antes de modificar SQLite.

## Operación, actualización y problemas

### Operación habitual

~~~bash
docker compose ps
docker compose logs --tail=100 app
curl -f http://127.0.0.1:8787/health
curl -f http://127.0.0.1:8787/ready

docker compose exec app node server/scripts/migrate.js
docker compose exec app node server/scripts/backup.js
docker compose restart app
~~~

Para actualizar, crea un backup antes y luego:

~~~bash
git pull
docker compose build --no-cache
docker compose up -d
docker compose logs --tail=100 app
curl -f http://127.0.0.1:8787/health
curl -f http://127.0.0.1:8787/ready
~~~

### Migraciones, restauración e importación

La única migración inicial actual es server/database/migrations/001_initial.sql: crea todas las tablas e índices y siembra settings. schema_migrations guarda el checksum SHA-256 de cada archivo. Nunca modifiques ni renombres una migración aplicada.

Para un cambio de esquema:

1. Crea una nueva migración, por ejemplo 002_descripcion.sql.
2. Pruébala sobre una copia local.
3. Crea un backup.
4. Reinicia la app o ejecuta server/scripts/migrate.js.
5. Comprueba /ready y la funcionalidad afectada.

El backup ya se explicó arriba. Para restaurar:

~~~bash
docker compose down
sudo cp -a /mnt/appdata/database.sqlite /mnt/backups/database-before-restore.sqlite
sudo cp /mnt/backups/database-AAAA-MM-DDTHH-MM-SS-sssZ.sqlite /mnt/appdata/database.sqlite
sudo rm -f /mnt/appdata/database.sqlite-wal /mnt/appdata/database.sqlite-shm
docker compose up -d
curl -f http://127.0.0.1:8787/ready
~~~

El importador D1 es opcional y sirve sólo si alguna vez decides recuperar datos. Acepta SQL/JSON y se detiene si el destino ya tiene datos; no borra ni sobrescribe:

~~~bash
docker compose exec app node server/scripts/import-d1.js --input /app/data/export.sql
npm run db:import -- --input /ruta/export.json
~~~

### Problemas comunes

**El contenedor no está ready.** Revisa logs, espacio/propiedad de /mnt/appdata, que DATABASE_PATH y BACKUP_PATH sean rutas internas /app/data y /app/backups, y que ningún proceso ocupe 127.0.0.1:8787.

**La página está en blanco o un dashboard recargado da 404.** Reconstruye con npm run build o Docker. Comprueba STATIC_SOURCE_PATH=/app/frontend/dist y STATIC_ROOT=/app/data/web. Fastify debe poder copiar los assets al SSD y manejar las rutas SPA.

**Google/Discord están deshabilitados.** Falta el Client ID o Client Secret. Corrige .env, reinicia app y comprueba que el callback registrado sea exactamente PUBLIC_ORIGIN más su ruta.

**OAuth devuelve auth_error=oauth_failed.** Revisa PUBLIC_ORIGIN, dominio HTTPS del túnel, la URL de callback del proveedor, el Client Secret y que la cookie OAuth no se pierda por un dominio distinto.

**No aparecen estadísticas.** Comprueba que Roblox llama /games/Clothing/stats además de la ruta de aviso, STATS_SECRET, firma/timestamp/nonce y, para Missile, BOMBGAME_SECRET y la ruta exacta. Revisa application_logs y una copia de las tablas weekly_stats, daily_stats, game_stat_events y webhook_events.

**Hay estadísticas, pero no Discord.** Puede ser normal: worker_enabled pausado, UserId bloqueado o webhook vacío. Si no, Discord devolvió error; consulta application_logs. /stats no debe perder datos por ello.

**Docker, Nginx o power no están disponibles.** Es el estado seguro por defecto. Power requiere un sensor real. Docker/Nginx/host requieren los helpers, sockets, grupo, secretos, flags y allowlist documentados antes.

**Una gráfica parece desproporcionada.** Comprueba METRICS: spent/revenue usan eje robux; single/bulk/donations y métricas Missile usan count.

### Validación antes de desplegar

~~~bash
npm ci
npm run build
npm test
ENV_FILE=.env.example docker compose config
docker compose build
~~~

La suite comprueba health/ready y fallback SPA, signup y sesión web, aprobación móvil, rotación/replay de refresh token, webhook firmado idempotente y backup SQLite consistente. npm test también ejecuta el lint del frontend.

## Reglas de seguridad

- Nunca subas .env, secretos, webhooks Discord, backups ni exports a Git.
- Usa secretos distintos, aleatorios y de 32 bytes o más. No cambies PASSWORD_PEPPER después de crear cuentas sin un plan de migración.
- Mantén REQUIRE_SIGNED_WEBHOOKS=true y genera un nonce nuevo para cada evento Roblox.
- Valida secret, firma, cuerpo, sesión, rol y permiso en backend; ocultar un botón React no concede acceso.
- No copies sólo database.sqlite en caliente; crea un backup consistente.
- No edites migraciones aplicadas ni elimines datos sin backup y confirmación.
- No montes el socket Docker real ni habilites exec/comandos desde HTTP.
- Mantén DOCKER_ENABLED, NGINX_ENABLED y HOST_CONTROL_ENABLED en false hasta completar sus helpers restringidos.
- Antes de actualizar: backup, pruebas, build, docker compose config y comprobaciones health/ready.

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

+
### Esquema de datos

| Tabla | Datos y proceso asociado |
| --- | --- |
| schema_migrations | Archivos SQL aplicados, checksum SHA-256 y fecha. |
| users | Correo, hash de contraseña, display name, rol y creación. |
| oauth_accounts | Enlace entre usuario e identidad Google/Discord. |
| auth_sessions | Hash del token web, hash User-Agent, creación y expiración. |
| auth_failures | Intentos de acceso y bloqueo temporal por correo. |
| webhook_events | Identificador del evento para deduplicar solicitudes Roblox. |
| contacts | Equipo, enlaces, posición, visibilidad y grupo visual. |
| site_settings | Textos de la web, worker_enabled y última semana resumida. |
| weekly_stats | Totales Clothing por semana. |
| daily_stats | Totales Clothing por día. |
| discord_message_blocklist | UserIds que no generan avisos Discord. |
| game_stat_events | Eventos Clothing/Missile y métricas para Games. |
| mobile_sessions | Dispositivo, hashes de red/agent, estado pending/approved/revoked y aprobación. |
| mobile_refresh_tokens | Hash, expiración, rotación y revocación de refresh tokens. |
| audit_events | Acción sensible, actor, dispositivo, resultado y metadata. |
| application_logs | Mensajes INFO, WARNING, ERROR o CRITICAL del servidor. |
| request_logs | Request ID, endpoint, estado, latencia y hash de origen. |
| request_metric_buckets | Agregados de requests por minuto, método, endpoint y estado. |
| alerts | Umbral, severidad, mensaje y reconocimiento. |
| server_events | Reinicios, apagados y solicitudes remotas. |

### Migraciones

La primera migración, server/database/migrations/001_initial.sql, crea el esquema completo actual e inserta la configuración inicial. Cada inicio de la aplicación verifica los checksums de las migraciones aplicadas. Para cambiar el esquema, crea un archivo nuevo con prefijo numérico, por ejemplo 002_agregar_campo.sql; no edites una migración ya aplicada.

~~~bash
docker compose exec app node server/scripts/migrate.js
~~~

Prueba primero en una copia de SQLite y crea un backup antes de llevar una migración a la Raspberry Pi.

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

## Resumen rápido de API

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

Descomenta el mount del proxy en Compose, define `DOCKER_ENABLED=true` y la allowlist. Ejecuta `getent group agmapp | cut -d: -f3`, copia el número resultante como `AGM_SOCKET_GID` en `.env` y vuelve a crear el contenedor. El proxy rechaza `exec`, comandos, creación/borrado de contenedores, imágenes y volúmenes.

Reinicio/apagado y control Nginx requieren `ops/agm-host-control.service`. Instálalo por separado; el helper se ejecuta como root pero acepta exclusivamente cuatro acciones firmadas con HMAC y nonce: `restart`, `shutdown`, `nginx-reload`, `nginx-restart`.

```bash
sudo install -d -m 0750 -o root -g agmapp /etc/another-game-more
sudo sh -c 'umask 077 && printf "%s\n" "HOST_CONTROL_SECRET=REEMPLAZA_CON_UN_SECRETO_DE_32_O_MAS" > /etc/another-game-more/host-control.env'
sudo cp ops/agm-host-control.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agm-host-control.service
```

Después descomenta sólo el mount `/run/agm-host-control.sock:/run/agm-host-control.sock`, configura el mismo secreto como `HOST_CONTROL_SECRET` en `.env` y activa `HOST_CONTROL_ENABLED=true`. Activa `NGINX_ENABLED=true` sólo si Nginx existe realmente. Nunca habilites estos controles antes de comprobar el servicio, los permisos del socket y el grupo `agmapp`.

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
