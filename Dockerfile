# syntax=docker/dockerfile:1

# ==============================================================================
# Dockerfile para Expo Router (Web) en Producción
# Stack: Expo SDK 58 · React Native · TypeScript · Expo Router · Supabase Cloud
# Arquitectura: Multi-stage build con node:20-alpine
# ==============================================================================

# ------------------------------------------------------------------------------
# Etapa 1: Instalación de dependencias de compilación (deps)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS deps

# libc6-compat para compatibilidad de herramientas nativas y bundlers en Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copiar descriptores de paquetes primero para maximizar caché de capas Docker
COPY package*.json ./

# Instalar dependencias exactas y reproducibles
RUN npm ci

# ------------------------------------------------------------------------------
# Etapa 2: Compilación de la aplicación web con Expo Router (builder)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Variables de entorno públicas de Supabase para inyección durante el build
# En Expo, las variables EXPO_PUBLIC_* deben estar disponibles en tiempo de compilación
# para ser incrustadas en los bundles estáticos de cliente
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY

ENV NODE_ENV=production \
    EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY

# Copiar dependencias de node_modules resueltas
COPY --from=deps /app/node_modules ./node_modules

# Copiar el código fuente completo del proyecto
COPY . .

# Compilar la aplicación web mediante el exportador oficial de Expo Router
# Genera el bundle estático SPA optimizado en /app/dist
RUN npx expo export --platform web

# ------------------------------------------------------------------------------
# Etapa 3: Servidor de ejecución ligero en producción (runner)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

# Instalar dumb-init para gestión limpia de señales de apagado (SIGTERM/SIGINT) en PID 1
RUN apk add --no-cache dumb-init

WORKDIR /app

# Variables de entorno del servidor
ENV NODE_ENV=production \
    PORT=3000

# Instalar el servidor HTTP 'serve' recomendado oficialmente por el equipo de Expo
RUN npm install -g serve && npm cache clean --force

# Copiar únicamente los artefactos web estáticos compilados desde la etapa builder
COPY --from=builder --chown=node:node /app/dist ./dist

# Ejecutar como usuario sin privilegios por seguridad (CIS Docker Benchmark)
USER node

# Exponer el puerto de servicio web
EXPOSE 3000

# Healthcheck nativo para orquestadores (Kubernetes, AWS ECS, Docker Swarm)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

# dumb-init permite que las señales del orquestador apaguen el contenedor ordenadamente
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# -s (--single) activa el soporte de Single Page Application (SPA) para expo-router,
# reescribiendo todas las rutas a index.html y evitando errores 404 al navegar
CMD ["serve", "-s", "dist", "-l", "3000"]

