# Imagen única para api1, api2 y api3 (tp3-globallogistics-api:local).
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencias primero para aprovechar la caché de capas.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# wget (BusyBox) viene incluido en Alpine y lo usa el healthcheck de Compose.
USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
