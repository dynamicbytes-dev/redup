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

3. Configurar los secretos de producción en EAS:
   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://tu-proyecto.supabase.co"
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "tu_anon_key_de_produccion"
   ```

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
3. Aplicar todas las migraciones acumuladas (`000000_init.sql` a `000012_...sql`):
   ```bash
   npm run db:push
   ```
4. Desplegar las Edge Functions seguras:
   ```bash
   npm run functions:deploy
   ```
5. Configurar los secretos de las Edge Functions en Supabase Cloud:
   ```bash
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key"
   npx supabase secrets set LIVEKIT_URL="wss://tu-servidor.livekit.cloud"
   npx supabase secrets set LIVEKIT_API_KEY="tu_api_key"
   npx supabase secrets set LIVEKIT_API_SECRET="tu_api_secret"
   ```

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

## 5. Actualizaciones OTA y Monitoreo

1. **EAS Update (Over-The-Air Updates)**:
   - Permite publicar parches críticos de JS/assets al instante sin pasar por revisión de las tiendas:
     ```bash
     npx eas update --channel production --message "Parche de seguridad crítico"
     ```
2. **Monitoreo de Errores (Sentry)**:
   - Integrar `@sentry/react-native`:
     ```bash
     npx expo install @sentry/react-native
     ```
   - El módulo [`src/lib/error-reporting.ts`](file:///Users/rosangeles/Documents/redup/src/lib/error-reporting.ts) ya está preparado para redirigir automáticamente los reportes a Sentry en producción.

---

## 6. Pipeline de Integración Continua (CI)

El proyecto incluye el flujo automatizado [`.github/workflows/ci.yml`](file:///Users/rosangeles/Documents/redup/.github/workflows/ci.yml) que en cada `push` y `pull request` ejecuta:
1. `npx expo-doctor` (integridad de dependencias y schema Expo SDK 58).
2. `npx expo lint` (calidad de código sin advertencias).
3. `npx tsc --noEmit` (tipado estricto TypeScript).

