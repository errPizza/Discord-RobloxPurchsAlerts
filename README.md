# ALERTAS DE COMPRA ( ROBLOX -> DISCORD )
Para saber que pedo con las comisiones y demas, tambien tiene stats semanales :D

> [!NOTE]
> Ultima actualizacion [ 20/07/2026 ] | ( 25.3~horas de trabajo )

> [!CAUTION]
> Cuidado pequeño niño, cuando hice este codigo solo dios y yo sabiamos como funcionaba. Ahora ¡SOLO DIOS SABE!

> [!WARNING]
> Actualiza solo si sabes lo que estas haciendo. Esto esta conectado a Cloudflare con un sistema de Webhooks - Discord con una base de datos.

> [!IMPORTANT]
> Los servidores estan activos 24/7, si un error aparece, arreglalo lo mas rapido posible

> [!TIP]
> Para agregar mas variables encriptadas ve a Cloudflare y añadele en Workers & Pages -> Settigns -> Variables and secrets :D

## Autenticación

El acceso por correo utiliza `SESSION_SECRET` y `PASSWORD_PEPPER`. Para activar los proveedores sociales en `prchsalerts`, configura también estos secretos:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`

Registra exactamente estas URLs de redirección en cada proveedor:

- Google: `https://prchsalerts.kikinttrex0231.workers.dev/api/auth/oauth/google/callback`
- Discord: `https://prchsalerts.kikinttrex0231.workers.dev/api/auth/oauth/discord/callback`

Las cuentas nuevas reciben el rol `member`. Solo los administradores acceden al dashboard y únicamente `kikinttrex0231@gmail.com` puede promover usuarios desde la sección **Promote**.

Las contraseñas nuevas deben tener entre 8 y 128 caracteres e incluir al menos una mayúscula, dos minúsculas, un número y un signo.

## Despliegue correcto

Ejecuta siempre desde la raíz del repositorio:

```bash
npm run deploy
```

En **Cloudflare → prchsalerts → Settings → Builds**, usa:

- Root directory: `/`
- Build command: puede quedar vacío (`postinstall` ya compila Vite) o usar `npm run build`
- Deploy command: `npx wrangler deploy --keep-vars`

No configures `frontend` como root ni despliegues esa carpeta directamente: eso publica el HTML fuente sin Vite, elimina la API de la versión activa y deja la página en blanco.
