# Build context: apps/api (self-contained -- it imports nothing from libs/,
# unlike apps/web/mobile). Build from the repo root with:
#   docker build -f infra/docker/api.Dockerfile apps/api
#
# node:22-slim (Debian/glibc), not -alpine: not required for Prisma here --
# this project uses the @prisma/adapter-pg driver adapter, which has no
# native query-engine binary to worry about across libc flavors (verified:
# apps/api/generated/prisma contains no .node/engine binaries at all) --
# but argon2 (password hashing) does have a native addon, and slim avoids
# any risk of it lacking a prebuilt binary for musl.

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# `build` above is also targeted directly (not just as a base for `runtime`
# below) to run `npx prisma migrate deploy` in infra/deployment's `migrate`
# service -- it still has the Prisma CLI (a devDependency) and full source,
# unlike the pruned `runtime` stage.

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
# dist/ is self-contained: tsc compiles apps/api/generated/prisma's .ts
# files into dist/generated/prisma alongside dist/src, so PrismaService's
# `require('../../generated/prisma/client')` resolves correctly without
# copying anything from outside dist/.
COPY --from=build /app/dist ./dist
RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --no-create-home nestjs
USER nestjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
