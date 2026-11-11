# syntax=docker/dockerfile:1

# ==============================================================================
# Redup · Build web (Expo Router SPA) para producción
# Stack: Expo SDK 58 · React Native Web · TypeScript · Supabase Cloud · LiveKit
#
# Uso para compilar la imagen:
#   docker build \
#     --build-arg EXPO_PUBLIC_SUPABASE_URL=https://cctpntjrlduntjjpjpcb.supabase.co \
#     --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key> \
#     --build-arg EXPO_PUBLIC_LIVEKIT_URL=wss://redup-app-bfdopyix.livekit.cloud \
#     --build-arg PUBLIC_SERVER_URL=http://18.191.49.251 \
#     -t redup-web:latest .
#
# Uso para ejecutar el contenedor:
#   docker run -d \
#     --name redup-web \
#     --restart unless-stopped \
#     -p 3000:3000 \
#     redup-web:latest
# ==============================================================================

ARG NODE_VERSION=22

# ------------------------------------------------------------------------------
# Etapa 1: dependencias (capa cacheable)
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps

WORKDIR /app

# Copiar descriptores de dependencias para maximizar el reuso de caché
COPY package.json package-lock.json ./

# Instalación reproducible con caché de npm
# No definimos NODE_ENV=production para que se incluyan devDependencies necesarias
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ------------------------------------------------------------------------------
# Etapa 2: compilación del bundle web estático (Expo Router SPA)
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /app

# Variables de entorno y argumentos de compilación (Expo las inserta en el bundle cliente)
ARG EXPO_PUBLIC_SUPABASE_URL=https://cctpntjrlduntjjpjpcb.supabase.co
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_LIVEKIT_URL=wss://redup-app-bfdopyix.livekit.cloud
ARG PUBLIC_SERVER_URL=http://18.191.49.251
ARG EXPO_PUBLIC_SERVER_URL=http://18.191.49.251

ENV NODE_ENV=production \
    CI=1 \
    EXPO_NO_TELEMETRY=1 \
    EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    EXPO_PUBLIC_LIVEKIT_URL=$EXPO_PUBLIC_LIVEKIT_URL \
    PUBLIC_SERVER_URL=$PUBLIC_SERVER_URL \
    EXPO_PUBLIC_SERVER_URL=$EXPO_PUBLIC_SERVER_URL

# Validación de variables obligatorias antes de compilar
RUN test -n "$EXPO_PUBLIC_SUPABASE_URL" || \
    (echo "ERROR: falta --build-arg EXPO_PUBLIC_SUPABASE_URL" >&2 && exit 1)
RUN test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY" || \
    (echo "ERROR: falta --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY" >&2 && exit 1)

# Dependencias resueltas de la etapa anterior
COPY --from=deps /app/node_modules ./node_modules

# Código fuente (filtrado rigurosamente mediante .dockerignore)
COPY . .

# Export estático oficial de Expo Router para web en dist/
RUN npx expo export --platform web --output-dir dist

# ------------------------------------------------------------------------------
# Etapa 3: runtime mínimo y seguro (solo estáticos + servidor HTTP SPA)
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner

# dumb-init gestiona señales del kernel (SIGTERM/SIGINT) como PID 1.
# serve@14.2.4 es el servidor estático ligero para Single Page Applications (SPA).
RUN apk add --no-cache dumb-init \
    && npm install -g serve@14.2.4 \
    && npm cache clean --force

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Solo se copian los archivos estáticos resultantes, con permisos asignados al usuario node
COPY --from=builder --chown=node:node /app/dist ./dist

# Ejecución sin privilegios de root para máxima seguridad
USER node

EXPOSE 3000

# Healthcheck nativo con Node 22 (fetch integrado, sin necesidad de curl ni wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# -s (--single) redirige todas las rutas a index.html para soportar Expo Router
CMD ["serve", "-s", "dist", "-l", "3000"]
