# Configuración de notificaciones push con FCM (Android)

Redup usa **Expo Push Service** para entregar notificaciones. En Android, Expo
necesita credenciales de **Firebase Cloud Messaging (FCM V1)** y el archivo
`google-services.json` dentro del build nativo.

El icono de la notificación es una **esfera del dragón** monocroma con 4
estrellas. Se genera con:

```bash
node scripts/generate-notification-icon.js
```

El archivo resultante es `assets/images/notification-icon.png` y ya está
configurado en el plugin `expo-notifications` de `app.json`.

## 1. Crear el proyecto de Firebase

1. Entra a https://console.firebase.google.com/
2. Crea un proyecto (por ejemplo, `redup-app`).
3. Dentro del proyecto, pulsa **Add app → Android**.
4. Usa exactamente este nombre de paquete:

```text
app.redup.mobile
```

5. Descarga `google-services.json`.
6. Colócalo en la raíz del repositorio:

```text
/Users/rosangeles/Documents/redup/google-services.json
```

> `google-services.json` ya está en `.gitignore`. No se subirá a Git.

## 2. Crear la clave de servicio para FCM V1

1. En Firebase: **Project settings → Service accounts**.
2. Pulsa **Generate new private key**.
3. Guarda el JSON como:

```text
/Users/rosangeles/Documents/redup/fcm-service-account.json
```

> Este archivo es un secreto. Ya está en `.gitignore`; no lo compartas ni lo
> subas al repositorio.

## 3. Subir la clave a Expo

La cuenta de Expo es `rosadev` y el proyecto es `redup`. Puedes hacerlo desde
el panel:

https://expo.dev/accounts/rosadev/projects/redup/credentials

Ruta: **Android → Push Notifications → FCM V1 → Upload a new service account
key** y selecciona `fcm-service-account.json`.

O por CLI:

```bash
eas credentials -p android
```

Selecciona el proyecto, entra en **Push Notifications → FCM V1 → Upload a new
service account key** y usa la ruta del archivo.

## 4. Regenerar Android y compilar

Con `google-services.json` en la raíz:

```bash
npx expo prebuild --platform android --no-install
cd android
set -a && . ../.env.production && set +a
NODE_ENV=production ANDROID_HOME="$HOME/Library/Android/sdk" \
  ./gradlew assembleRelease
```

El APK queda en:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## 5. Probar

- Instala el APK en un **dispositivo físico** (los emuladores no obtienen token
  FCM real).
- Inicia sesión y acepta el permiso de notificaciones.
- Envía un mensaje desde otra cuenta.
- La notificación debe mostrar la esfera del dragón y usar el canal
  `messages`.

## Notas

- El icono debe ser blanco con fondo transparente. Android usa el canal alfa
  como máscara; por eso las estrellas son huecos transparentes.
- No cambies el `icon` del plugin `expo-notifications` por el icono completo de
  la app: Android lo renderizaría como un cuadrado blanco.
- Si más adelante cambias el icono, vuelve a ejecutar el generador y
  `npx expo prebuild --platform android`.
