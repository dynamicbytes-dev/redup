# syntax=docker/dockerfile:1

# ==============================================================================
# Redup · Build web (Expo Router) para producción
# Stack: Expo SDK 58 · React Native Web · TypeScript · Supabase Cloud
#
# Uso:
#   docker build \
#     --build-arg EXPO_PUBLIC_SUPABASE_URL=https://cctpntjrlduntjjpjpcb.supabase.co \
#     --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key> \
#     -t redup-web .
#
#   docker run -d --name redup-web --restart unless-stopped -p 3000:3000 redup-web
# ==============================================================================

ARG NODE_VERSION=22

# ------------------------------------------------------------------------------
# Etapa 1: dependencias (capa cacheable)
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps

WORKDIR /app

# Copiar solo los descriptores para aprovechar la caché de Docker
COPY package.json package-lock.json ./

# Instalación reproducible. No se define NODE_ENV=production aquí para que
# npm instale también devDependencies (necesarias para el export de Expo).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ------------------------------------------------------------------------------
# Etapa 2: compilación del bundle web estático
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /app

# Variables EXPO_PUBLIC_*: Expo las inserta en el bundle en tiempo de build.
# No son secretos reales (la anon key es pública), pero no deben hardcodearse
# en la imagen ni en el repositorio.
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY

ENV NODE_ENV=production \
    CI=1 \
    EXPO_NO_TELEMETRY=1

# Fallar temprano si faltan variables obligatorias
RUN test -n "$EXPO_PUBLIC_SUPABASE_URL" || \
    (echo "ERROR: falta --build-arg EXPO_PUBLIC_SUPABASE_URL" >&2 && exit 1)
RUN test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY" || \
    (echo "ERROR: falta --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY" >&2 && exit 1)

ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY

# Dependencias ya resueltas en la etapa anterior
COPY --from=deps /app/node_modules ./node_modules

# Código fuente (el contexto se filtra con .dockerignore)
COPY . .

# Export oficial de Expo Router. Genera la SPA estática en /app/dist.
# LiveKit URL para llamadas WebRTC en cliente
ARG EXPO_PUBLIC_LIVEKIT_URL
ENV EXPO_PUBLIC_LIVEKIT_URL=$EXPO_PUBLIC_LIVEKIT_URL

RUN npx expo export --platform web --output-dir dist

# ------------------------------------------------------------------------------
# Etapa 3: runtime mínimo (solo estáticos + servidor HTTP)
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner

# dumb-init gestiona señales (SIGTERM/SIGINT) correctamente en PID 1.
# `serve` es el servidor estático recomendado por Expo.
RUN apk add --no-cache dumb-init \
    && npm install -g serve@14.2.7 \
    && npm cache clean --force

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Solo se copian los artefactos compilados, nunca el código fuente ni .env
COPY --from=builder --chown=node:node /app/dist ./dist

# Ejecutar sin privilegios
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# -s (--single) reescribe todas las rutas a index.html para Expo Router (SPA)
CMD ["serve", "-s", "dist", "-l", "3000"]
