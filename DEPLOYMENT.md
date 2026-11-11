# Redup · Guía Maestra de Despliegue a Producción

Esta guía detalla los pasos y requisitos indispensables para llevar Redup a producción con alta disponibilidad, seguridad y cumplimiento normativo.

---

## 1. Expo Application Services (EAS Build y EAS Submit)

El proyecto cuenta con [`eas.json`](file:///Users/rosangeles/Documents/redup/eas.json) configurado con los 3 perfiles oficiales (`development`, `preview` y `production`).

### Paso a paso para compilar:
1. Instalar la CLI de EAS e iniciar sesión:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Vincular el proyecto con tu cuenta de Expo:
   ```bash
   eas project:init
   ```
   *(Esto asignará automáticamente el `projectId` y el `owner` en `app.json`).*

3. Configurar las variables de producción en EAS (entornos `production` y `preview`):
   ```bash
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL \
     --value "https://cctpntjrlduntjjpjpcb.supabase.co" \
     --environment production --visibility plaintext

   # Obtén la anon key real del proyecto con:
   #   npx supabase projects api-keys --project-ref cctpntjrlduntjjpjpcb
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
     --value "<anon_key_de_cctpntjrlduntjjpjpcb>" \
     --environment production --visibility sensitive
   ```
   `eas secret:create` sigue funcionando pero está en modo legado; usa `eas env:create`.
   Repite los comandos con `--environment preview` si compilas el perfil `preview`.

   Para desarrollo local, el archivo `.env` ya apunta al proyecto de producción
   `https://cctpntjrlduntjjpjpcb.supabase.co`.

4. Compilar el APK o bundle de producción:
   ```bash
   # Para Android (AAB para Google Play o APK en preview)
   eas build --platform android --profile production
   eas build --platform android --profile preview

   # Para iOS (IPA para App Store / TestFlight)
   eas build --platform ios --profile production
   ```

5. **Notificaciones Push Remotas (FCM y APNs)**:
   - Al ejecutar `eas build`, EAS te guiará para subir tu clave `.p8` de Apple Developer (APNs) y el archivo `google-services.json` vinculado al proyecto de Firebase Cloud Messaging (FCM).

### Servidor web de producción (Docker)

La versión web se publica en la EC2 con IP pública **`18.191.49.251`**, servida por
el `Dockerfile` en el puerto **3000**:

```bash
docker build \
  --build-arg EXPO_PUBLIC_SUPABASE_URL=https://cctpntjrlduntjjpjpcb.supabase.co \
  --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key_de_produccion> \
  -t redup-web .

docker run -d --name redup-web --restart unless-stopped -p 3000:3000 redup-web
```

- El `Dockerfile` usa **Node 22** (requerido por Expo SDK 58) y un build multi-stage:
  dependencias → export web → runtime mínimo con `serve`.
- La imagen final solo contiene `dist/`; no incluye código fuente, `node_modules`
  ni archivos `.env`. Las variables se inyectan con `--build-arg`.
- `.dockerignore` excluye `node_modules/`, `android/`, `ios/`, `dist/`,
  `supabase/`, `.env*`, documentación y artefactos de build.
- Si compilas desde un Mac Apple Silicon para una EC2 x86_64, usa:
  ```bash
  docker buildx build --platform linux/amd64 \
    --build-arg EXPO_PUBLIC_SUPABASE_URL=https://cctpntjrlduntjjpjpcb.supabase.co \
    --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key_de_produccion> \
    -t redup-web --load .
  ```
- Verifica el contenedor con `docker ps` (debe mostrar `0.0.0.0:3000->3000/tcp`),
  `docker logs -f redup-web` y `curl -I http://127.0.0.1:3000`.
- Si pones Nginx/Caddy delante en 80/443, publica el contenedor solo en localhost
  (`-p 127.0.0.1:3000:3000`) y **cierra el puerto 3000 en el Security Group**.
- URL pública: `http://18.191.49.251:3000`
- En **Supabase Dashboard → Authentication → URL Configuration** agrega como
  *Redirect URLs*:
  - `http://18.191.49.251:3000/**`
  - `http://18.191.49.251:3000/reset-password`
- Asegúrate de que el Security Group de AWS permita el puerto `3000` (TCP) y, si
  publicas el dominio `redup.app`, coloca Nginx/Caddy delante para servir HTTPS y
  los archivos `.well-known` de los deep links.

---

## 2. Supabase Cloud (Base de Datos y Migraciones)

### Despliegue de Base de Datos:
1. Iniciar sesión en la CLI de Supabase:
   ```bash
   npx supabase login
   ```
2. Enlazar el proyecto local con el proyecto creado en Supabase Cloud:
   ```bash
   npm run db:link
   ```
3. Verificar qué migraciones se aplicarán y aplicar todas (`000000_init.sql` a `000016_...sql`):
   ```bash
   npx supabase db push --dry-run
   npm run db:push
   ```
   La migración `20261103000015_cron_and_push_idempotency.sql` contiene el rate limit
   server-side y la idempotencia de push. No debe quedar fuera del despliegue.

   > **Realtime y ownership:** en el stack local el rol `postgres` no es dueño de
   > `realtime.messages`, así que `supabase start` directo falla en la migración
   > `20261103000010`. Por eso `npm run db:start` arranca sin migraciones, concede
   > `supabase_realtime_admin` a `postgres` dentro del contenedor y después aplica
   > todo. En Supabase Cloud, si `db push` falla con
   > `must be owner of table messages`, aplica la migración `000010` desde el SQL
   > Editor y vuelve a ejecutar `db push`; si persiste, abre un ticket a soporte
   > de Supabase para que revise la ownership de la tabla.

4. Ejecutar el lint de base de datos y los tests de seguridad en local:
   ```bash
   npm run db:start   # prepara el stack local (incluye el bootstrap de Realtime)
   npx supabase db lint
   npm run test:db
   ```
   `npm run db:reset` detiene el stack sin backup y lo reconstruye con el seed local.
5. Desplegar las Edge Functions seguras:
   ```bash
   npm run functions:deploy
   ```
6. Configurar los secretos de las Edge Functions en Supabase Cloud:
   ```bash
   npx supabase secrets set LIVEKIT_URL="wss://tu-servidor.livekit.cloud"
   npx supabase secrets set LIVEKIT_API_KEY="tu_api_key"
   npx supabase secrets set LIVEKIT_API_SECRET="tu_api_secret"
   npx supabase secrets set PUSH_WEBHOOK_SECRET="un-secreto-largo-y-aleatorio"
   ```
   No configures `TURNSTILE_SECRET_KEY` en la v1: la app todavía no renderiza el
   widget de Turnstile. Si se define, `auth-login` exigirá un token que el cliente
   aún no envía y los inicios de sesión por `@username` fallarán con 403.

---

## 3. Infraestructura y Plan de Supabase

Para una aplicación de mensajería en tiempo real no es viable el **Free Tier** de Supabase (se pausa automáticamente tras 7 días de inactividad y tiene límites estrictos de conexiones concurrentes). Se recomienda el plan **Supabase Pro**:

| Característica | Free Tier | Supabase Pro |
| :--- | :--- | :--- |
| **Pausa por inactividad** | Sí (se apaga a los 7 días) | **No (Siempre activo)** |
| **Backups** | Solo snapshot manual | **Diarios automáticos + PITR (7 a 28 días)** |
| **Realtime concurrentes** | 200 conexiones | **500+ conexiones (ampliable)** |
| **Storage** | 1 GB | **100 GB (ampliable)** |
| **Conexiones Postgres** | Límite bajo | **Connection Pooling con Supavisor** |

> [!IMPORTANT]
> **Activar PITR (Point-in-Time Recovery)** en Supabase Dashboard (`Database` -> `Backups`) para poder restaurar la base de datos a cualquier segundo exacto ante incidentes o corrupción de datos.

---

## 4. Proveedor de Correo Transaccional (SMTP)

Gmail con contraseñas de aplicación no es apto para producción (límite de 100-500 correos/día y riesgo de bloqueo por spam). Se debe utilizar un proveedor transaccional especializado:

### Opciones Recomendadas:
1. **Resend** (Recomendado):
   - Host: `smtp.resend.com` | Puerto: `587` | Usuario: `resend` | Password: API Key
2. **Postmark**:
   - Host: `smtp.postmarkapp.com` | Puerto: `587` | Usuario/Password: Server Token
3. **SendGrid**:
   - Host: `smtp.sendgrid.net` | Puerto: `587` | Usuario: `apikey` | Password: API Key

### Configuración DNS Obligatoria en tu Dominio:
- **SPF**: Registro `TXT` en `@` con `v=spf1 include:resend.com ~all` (o el del proveedor).
- **DKIM**: 3 registros `CNAME` provistos por el proveedor para firmar criptográficamente los correos.
- **DMARC**: Registro `TXT` en `_dmarc.tudominio.com` con `v=DMARC1; p=reject; rua=mailto:dmarc@tudominio.com`.

---

## 5. Endurecimiento de Autenticación en Supabase Dashboard

En el Dashboard de Producción de Supabase (`Authentication` -> `Providers` / `Security`):
1. **Verificación de Email Obligatoria**:
   - Activar `Confirm email` (`enable_confirmations = true`).
2. **Seguridad y Longitud de Contraseñas**:
   - `Minimum password length`: Establecer en **8 caracteres**.
   - Activar requisitos de mayúsculas, minúsculas y números (`lower_upper_letters_digits`).
3. **Prevención de Ataques y Email Bombing**:
   - `Rate Limits`: Establecer `Max Frequency` para reseteos y confirmaciones en **60 segundos** (`max_frequency = "60s"`).
   - Activar `Secure password change` (requiere reautenticación para cambios de contraseña).
4. **Protección Anti-Bot (Captcha / Cloudflare Turnstile)**:
   - La v1 se lanza con Turnstile **desactivado** (`[auth.captcha] enabled = false`) y rate limits server-side. No configures `TURNSTILE_SECRET_KEY` todavía.
   - Para activarlo en v1.1: renderiza el widget en la app, envía `captchaToken` a `supabase.auth.signUp/signInWithPassword` y `turnstileToken` a `auth-login`; recién entonces activa Bot Detection en el Dashboard y define el secreto.

---

## 6. Deep Links Verificados (Universal Links / App Links)

Para evitar que otras apps instaladas secuestren enlaces y sesiones mediante el esquema personalizado `redup://`, se configuraron Universal Links (iOS) y App Links (Android) con el dominio `https://redup.app`:

### Archivos de verificación requeridos en el servidor web de `redup.app`:
1. **iOS (`https://redup.app/.well-known/apple-app-site-association`)**:
   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appID": "<APPLE_TEAM_ID>.app.redup.mobile",
           "paths": ["*"]
         }
       ]
     }
   }
   ```
2. **Android (`https://redup.app/.well-known/assetlinks.json`)**:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "app.redup.mobile",
         "sha256_cert_fingerprints": ["<TU_SHA256_CERTIFICATE_FINGERPRINT>"]
       }
     }
   ]
   ```

---

## 7. Requisitos de Publicación en App Store y Google Play

1. **Eliminación de Cuenta (App Store Guideline 5.1.1(v))**:
   - La app incluye en Ajustes el botón destructivo **"Eliminar mi cuenta"**, que ejecuta `public.delete_my_account()`.
   - Se eliminan el perfil, avatar, estados, tokens y el contenido de los mensajes enviados. En las conversaciones de otras personas esos mensajes quedan como **"eliminado"**. Las copias de seguridad cifradas pueden persistir durante el periodo de retención del proveedor.
   - Los objetos físicos huérfanos de S3 deben purgarse con un job que use la Storage API; la eliminación directa de `storage.objects` no borra el archivo subyacente. Esto queda como tarea P2 de operación.
2. **Moderación de Contenido Generado por Usuarios (Apple Guideline 1.2)**:
   - Política de Tolerancia Cero implementada en [`src/app/(app)/legal.tsx`](file:///Users/rosangeles/Documents/redup/src/app/(app)/legal.tsx).
   - Bloqueo inmediato de usuarios.
   - Mecanismo integrado de reporte de contenido abusivo ([`ReportModal`](file:///Users/rosangeles/Documents/redup/src/components/ui/report-modal.tsx)) conectado a la tabla `public.reports`.
   - Canal de contacto y atención de moderación en `soporte@redup.app`.

---

## 8. Actualizaciones OTA y Monitoreo

1. **EAS Update (Over-The-Air Updates)**:
   - Ejecuta una vez `npx eas update:configure` para que EAS asigne `updates.url` y el canal. `app.json` ya declara `runtimeVersion` con política `appVersion`.
   - Publica parches de JS/assets sin pasar por revisión:
     ```bash
     npx eas update --channel production --message "Parche de seguridad crítico"
     ```
2. **Monitoreo y Diagnóstico**:
   - `src/lib/error-reporting.ts` centraliza el reporte de excepciones de la app de forma segura en modo local sin requerir SDKs pesados.

---

## 9. Pipeline de Integración Continua (CI)

El proyecto incluye el flujo automatizado [`.github/workflows/ci.yml`](file:///Users/rosangeles/Documents/redup/.github/workflows/ci.yml) que en cada `push` y `pull request` ejecuta:
1. `npx expo-doctor` (integridad de dependencias y schema Expo SDK 58).
2. `npx expo lint` (calidad de código sin advertencias).
3. `npx tsc --noEmit` (tipado estricto TypeScript).
4. `npx supabase start`, `npx supabase db lint` y `npm run test:db` (RLS, RPCs y regresiones de seguridad).

---

## 10. Checklist mínimo antes de enviar a tiendas

- [ ] `extra.eas.projectId` completo y `submit.production` configurado (`ascAppId`, `appleTeamId`, service account de Google).
- [ ] Credenciales APNs/FCM cargadas en EAS y push probado en dispositivo físico.
- [ ] Proyecto Supabase de producción enlazado y migraciones `000000`–`000016` aplicadas.
- [ ] `EXPO_PUBLIC_SUPABASE_URL=https://cctpntjrlduntjjpjpcb.supabase.co` y la anon key del proyecto definidos en EAS y en el build de Docker.
- [ ] Build web desplegado en `http://18.191.49.251:3000` y puerto `3000` abierto en el Security Group.
- [ ] `site_url` y Redirect URLs de Supabase apuntando al dominio/HTTPS, a `http://18.191.49.251:3000/**` y a `redup://**`.
- [ ] `https://redup.app/.well-known/apple-app-site-association` y `assetlinks.json` publicados.
- [ ] SMTP transaccional (Resend/SendGrid/Postmark) con SPF, DKIM y DMARC.
- [ ] URL pública de privacidad y términos para App Store Connect y Play Console.
- [ ] Data Safety de Google Play, clasificación por edad y screenshots.
- [ ] `ITSAppUsesNonExemptEncryption` declarado (ya está en `app.json`).
- [ ] `npx expo-doctor`, `npx expo lint`, `npx tsc --noEmit`, `npx supabase db lint` y `npm run test:db` en verde.
- [ ] Build de producción probado en TestFlight / internal testing.

