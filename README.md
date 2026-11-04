# Redup

Mensajería en tiempo real estilo WhatsApp con identidad propia, construida con **Expo (React Native)** y **Supabase**.

> Estado: **Roadmap completo (Fases 0 a 8 implementadas)**. Incluye autenticación por usuario o correo, perfiles, alias y bloqueo de contactos, chats 1 a 1 y grupales en tiempo real, envío de fotos/documentos/notas de voz, presencia global y ajustes de privacidad, estados efímeros de 24 h, notificaciones push con `expo-notifications` y llamadas de voz y vídeo con soporte para LiveKit y señalización en tiempo real.

---

## Stack Tecnológico

| Capa | Tecnología |
| --- | --- |
| **App móvil y web** | Expo SDK 58 · React Native 0.88 · `expo-router` · TypeScript · React Compiler |
| **Estado y caché** | TanStack Query 5 (caché reactiva + actualizaciones optimistas) |
| **Backend & Tiempo real** | Supabase (Postgres 17, Auth, Realtime Postgres Changes / Broadcast / Presence, Storage, Edge Functions) |
| **Multimedia y Sensores** | `expo-image-picker`, `expo-image-manipulator`, `expo-audio`, `expo-document-picker`, `expo-notifications` |
| **Sistema de Diseño** | Componentes propios sobre `StyleSheet`, paleta índigo + coral, tema oscuro/claro/sistema |

---

## Requisitos

- **Node.js 22+**
- **Docker Desktop** activo (para levantar Supabase local)
- **Expo Go** en el teléfono, emulador Android / simulador iOS, o un dispositivo conectado por USB

---

## Puesta en marcha rápida

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Levantar Supabase local y aplicar migraciones + datos de prueba
npx supabase start
npm run db:reset

# 4. Iniciar el servidor de desarrollo de Expo
npm start
```

> **Nota para dispositivos físicos:** Si pruebas la app en tu celular conectado a la misma red Wi-Fi, `getSupabaseUrl()` detecta automáticamente la IP LAN de tu ordenador desde el bundler de Expo, o bien puedes definir `EXPO_PUBLIC_SUPABASE_URL=http://<TU_IP_LOCAL>:54321` en `.env`.

### Cuentas de prueba incluidas en `seed.sql`

| Usuario | Correo | Contraseña | Descripción |
| --- | --- | --- | --- |
| `ana` | `ana@redup.app` | `redup123` | Administradora del grupo *Equipo Redup 🚀* |
| `luis` | `luis@redup.app` | `redup123` | Conversación directa con Ana, estados y llamadas de ejemplo |
| `sofia` | `sofia@redup.app` | `redup123` | Miembro del grupo y autora de estados de 24 h |

### Servicios locales de Supabase

| Servicio | URL local |
| --- | --- |
| API / REST / Auth / Realtime | `http://127.0.0.1:54321` |
| Supabase Studio (Tablas, RLS, Storage) | `http://127.0.0.1:54323` |
| Mailpit (Bandeja de correos de recuperación) | `http://127.0.0.1:54324` |

---

## Funcionalidades implementadas (Fases 0 a 8)

### 1. Autenticación, perfiles y contactos (Fases 0 y 1)
- Registro con nombre visible, `@usuario` único (`citext`), correo y contraseña.
- Inicio de sesión unificado con **`@usuario` o correo electrónico** en un mismo campo (`resolve_login_email`).
- Recuperación de contraseña por correo con deep link (`redup://reset-password`).
- Edición de perfil con recorte de avatar, compresión a JPEG (512 px) y subida al bucket público `avatars`.
- Buscador global de usuarios por `@username` o nombre.

### 2. Chat 1 a 1 en tiempo real (Fase 2)
- Hilos en tiempo real mediante **Supabase Realtime** (`postgres_changes` + `broadcast` + `presence`).
- **Envío optimista** con UUID generado en el cliente: transición instantánea de reloj → ✓ enviado → ✓✓ leído y reintento con un toque en caso de fallo de red.
- Respuestas citadas, separadores de fecha, edición de mensajes propios (`edited_at`) y borrado lógico ("*Este mensaje fue eliminado*").
- Ficha de información del contacto (`/contact/[id]`) con **alias personalizado**, **silenciar notificaciones** (8 horas, 1 semana o siempre) y **bloqueo de usuarios**.

### 3. Chats grupales y administración (Fase 3)
- Creación de grupos (`/new-group`) con foto, nombre y selección múltiple de participantes (`create_group_conversation`).
- Burbujas de grupo con avatar y nombre del remitente + mensajes de sistema (`kind = 'system'`) para altas, bajas y cambios de configuración.
- Pantalla de información y administración del grupo (`/group/[id]`): edición de nombre y avatar, añadir participantes, ascender/degradar administradores (`admin` / `member`), expulsar miembros y salir del grupo con reasignación automática de administrador.

### 4. Multimedia: fotos, documentos y notas de voz (Fase 4)
- Envío de fotos desde **cámara o galería** con compresión automática (`expo-image-manipulator`), leyenda opcional y visor a pantalla completa (lightbox).
- Adjunto de documentos (`expo-document-picker`) con tarjeta de archivo, tamaño formateado y apertura externa.
- **Grabadora de notas de voz en vivo** (`expo-audio`) con cronómetro, cancelación rápida y reproductor integrado en la burbuja con barras de progreso y selector de velocidad (`1x`, `1.5x`, `2x`).
- Almacenamiento privado en el bucket `media` con URLs firmadas en caché y políticas RLS por pertenencia a la conversación.

### 5. Presencia avanzada y privacidad (Fase 5)
- Canal global `redup:presence` sincronizado con el ciclo de vida de la app (`AppState`) que actualiza `last_seen_at` al pasar a segundo plano.
- Pantalla de **Privacidad y bloqueos** (`/privacy`):
  - Mostrar u ocultar el estado **En línea** y última hora de conexión (`show_online`).
  - Activar o desactivar **Confirmaciones de lectura** (`read_receipts`) con reciprocidad.
  - Gestión y desbloqueo rápido de usuarios bloqueados.

### 6. Estados efímeros de 24 horas (Fase 6)
- Publicación de estados de **texto** (con paleta de fondos) y estados de **foto** con comentario.
- Bandeja de **Estados** dividida en *Mi estado*, *Recientes* (con anillo índigo para no vistos) y *Vistos*.
- Visor de historias a pantalla completa con barras de progreso segmentadas de 5 s, pausa al mantener pulsado, registro automático de visualizaciones (`status_views`), lista de quiénes vieron tus estados y eliminación de estados propios.

### 7. Notificaciones Push (Fase 7)
- Registro automático de token con `expo-notifications` en `public.push_tokens` y canal Android `messages` de máxima prioridad.
- Supresión inteligente de banners cuando el chat correspondiente ya está abierto en pantalla.
- Navegación directa (*deep-linking*) a `/chat/[id]` al tocar una notificación y sincronización del contador de globo (*badge*) con los mensajes no leídos.
- Interruptor de notificaciones y botón **Enviar notificación de prueba** en Ajustes, más Edge Function `supabase/functions/push-notify`.

### 8. Llamadas de voz y vídeo (Fase 8)
- Pantalla completa de llamada (`/call/[id]`) para **voz y vídeo** con cronómetro en vivo, controles de micrófono, altavoz, encendido/apagado de cámara, cambio de cámara frontal/trasera y vista *Picture-in-Picture*.
- Banner global flotante de **llamada entrante** en cualquier pantalla de la app con botones para contestar o rechazar en tiempo real (`redup:calls`).
- Pestaña **Llamadas** con filtros (*Todas* / *Perdidas*), historial detallado, rellamada rápida y resumen automático en el hilo de chat al finalizar (`📞 Llamada de voz · 1:24`).
- Edge Function `supabase/functions/livekit-token` para firmar tokens JWT (`HS256`) de salas **LiveKit**.

---

## Modelo de Datos (PostgreSQL + RLS)

```text
profiles              id → auth.users, username (citext único), display_name, avatar_path,
                      about, last_seen_at, show_online, read_receipts
blocks                blocker_id, blocked_id, created_at
contacts              owner_id, contact_id, alias, created_at
conversations         id, type ('direct'|'group'), name, avatar_path, direct_key, last_message_at
conversation_members  conversation_id, user_id, role ('member'|'admin'), last_read_at, muted_until
messages              id (UUID cliente), conversation_id, sender_id, kind ('text'|'image'|'audio'|'file'|'system'),
                      body, media_path, media_meta, duration_ms, reply_to_id, created_at, edited_at, deleted_at
statuses              id, user_id, kind ('text'|'image'), caption, bg_color, media_path, created_at, expires_at
status_views          status_id, viewer_id, viewed_at
push_tokens           user_id, token, platform ('ios'|'android'|'web'), device_name, updated_at
call_logs             id, conversation_id, caller_id, callee_id, kind ('voice'|'video'),
                      status ('ringing'|'ongoing'|'completed'|'missed'|'declined'),
                      room_name, started_at, answered_at, ended_at, duration_sec
```

---

## Estructura del Proyecto

```text
src/
  app/                        Rutas con Expo Router
    (auth)/                   welcome · login · signup · forgot-password
    (app)/                    Zona autenticada
      (tabs)/                 chats · status · calls · settings
      chat/[id].tsx           Hilo de conversación + visor de imágenes
      contact/[id].tsx        Ficha de contacto, alias, silenciar y bloqueo
      group/[id].tsx          Información y administración de grupo
      call/[id].tsx           Pantalla de llamada de voz y vídeo en curso
      new-chat.tsx            Buscador de personas para nuevo chat
      new-group.tsx           Asistente de creación de grupo
      profile.tsx             Edición de perfil y avatar
      privacy.tsx             Ajustes de privacidad y lista de bloqueados
    reset-password.tsx        Deep link para restablecer contraseña
  components/
    brand/                    Logotipo y Wordmark
    chat/                     ConversationRow, MessageBubble, Composer, DaySeparator
    navigation/               Barra de pestañas personalizada (TabBar)
    ui/                       AppText, Avatar, Button, TextField, ListItem, ActionSheet…
  features/
    auth/                     API de autenticación, sesión global, presencia y privacidad
    chats/                    API de conversaciones/grupos, media (fotos/audio/docs), hooks y realtime
    status/                   API y hooks de estados efímeros de 24 h
    notifications/            Registro push, notificaciones locales/remotas y deep-linking
    calls/                    API y hooks de llamadas de voz/vídeo, señalización y LiveKit
    profile/                  Subida y compresión de avatar y actualización de perfil
  lib/                        Cliente Supabase, resolución de URL LAN, React Query, Storage y formatos
  theme/                      Tokens de diseño y proveedor de tema claro/oscuro/sistema
supabase/
  migrations/                 Migraciones SQL (esquema, RLS, Storage, grupos, privacidad, estados, push, llamadas)
  functions/                  Edge Functions (push-notify y livekit-token)
  seed.sql                    Datos de prueba listos para usar
```

---

## Comandos disponibles

```bash
npm start            # Inicia el servidor de desarrollo de Expo
npm run android      # Compila e instala la app nativa en un dispositivo/emulador Android
npm run ios          # Compila e instala la app nativa en iOS
npm run web          # Inicia la versión web
npm run typecheck    # Verifica tipos con TypeScript (tsc --noEmit)
npm run lint         # Ejecuta el linter de Expo y React Compiler (expo lint)
npm run db:start     # Levanta los contenedores locales de Supabase
npm run db:stop      # Detiene los contenedores locales de Supabase
npm run db:reset     # Recrea la base de datos local aplicando todas las migraciones y seed.sql
npm run db:status    # Muestra las URLs y claves del entorno local de Supabase
```

---

## Roadmap

| Fase | Contenido | Estado |
| --- | --- | --- |
| **0** | Andamiaje, sistema de diseño y Supabase local | ✅ |
| **1** | Autenticación, perfiles y contactos | ✅ |
| **2** | Chat 1 a 1 en tiempo real, edición, alias, silenciar y bloqueos | ✅ |
| **3** | Grupos: creación, participantes y administración de roles | ✅ |
| **4** | Multimedia: fotos, documentos y notas de voz | ✅ |
| **5** | Presencia global avanzada y ajustes de privacidad | ✅ |
| **6** | Estados efímeros de 24 h con registro de vistas | ✅ |
| **7** | Notificaciones push con `expo-notifications` | ✅ |
| **8** | Llamadas de voz y vídeo con LiveKit y señalización en tiempo real | ✅ |
