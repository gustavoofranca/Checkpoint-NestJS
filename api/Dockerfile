# Production image of the API and the worker (docs/SECURITY.md section 6). Build from api/:
#   docker build -t checkpoint-api .                     the API; the worker runs dist/worker.js
#   docker build -t checkpoint-migrate --target migrate .  applies migrations, then exits
# The base image is pinned by digest; Dependabot proposes updates.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# The postinstall script runs `prisma generate`, which needs the schema and the Prisma config.
COPY package.json package-lock.json prisma.config.mts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && find dist -name '*.map' -delete

# Migrations need the Prisma CLI, a development dependency: a separate, short-lived image.
FROM build AS migrate
USER node
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# prisma and typescript are development dependencies but also optional peers of @prisma/client
# and @nestjs/swagger, which keeps them (and the Prisma CLI's large dependency tree) in a plain
# --omit=dev install. Omitting optional packages removes them; the other optional packages are
# unused here (msgpackr-extract only speeds up BullMQ, pg-cloudflare targets Cloudflare Workers,
# oxc-parser serves Sentry's bundler plugins). Scripts are skipped: the generated Prisma client
# is already compiled into dist/.
FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The curated app id list and the seed snapshot are read at run time.
COPY prisma/data ./prisma/data
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
