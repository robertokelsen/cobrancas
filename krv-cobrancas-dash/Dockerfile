# ---- build ----
FROM node:20-alpine AS builder
# CACHE-BUST: 20260529181345  (altere para forçar rebuild limpo)
ARG CACHEBUST=20260530120000
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# garante que a pasta public exista mesmo se nao houver assets
RUN mkdir -p public
# invalida o cache da camada de build a cada novo CACHEBUST
RUN echo "build $CACHEBUST" && npm run build

# ---- runtime (standalone enxuto) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
