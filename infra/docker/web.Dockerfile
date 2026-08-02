# Build context: repo root -- unlike apps/api, apps/web is NOT self-contained
# (it depends on libs/design-system, libs/design-tokens, libs/shared-models,
# libs/api-client, libs/realtime-client via root angular.json/tsconfig path
# mappings). Build from the repo root with:
#   docker build -f infra/docker/web.Dockerfile .

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# web's tsconfig paths (design-tokens, design-system, shared-models, ...)
# resolve to ./dist/<lib> -- the compiled lib output, not their src/ -- so
# those libs must be built first, exactly like `npm run build:web` does
# locally (see root package.json).
RUN npm run build:libs
RUN npx ng build web --configuration production

# nginx-unprivileged, not the default nginx image: runs as a non-root user
# out of the box (listens on 8080, not 80) -- consistent with the rest of
# this project's security posture (feat/030-security-hardening) without
# needing a custom USER/permissions dance on top of the official image.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY infra/docker/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/ >/dev/null || exit 1
