# syntax=docker/dockerfile:1
# Build: compile the SPA and the server. Slim (glibc) so native build tools install cleanly.
FROM node:24.22.1-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime: production dependencies only, files owned by root, the app runs as `node`.
FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
# Exec form, so SIGTERM reaches Node and the server shuts down cleanly.
CMD ["node", "dist/node/server/main.js"]
