# Built only in GitHub Actions (never on the VPS). Next.js standalone output.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders so `next build` can load the Payload config. Real values come from
# /opt/njmc/.env at run time; nothing secret is baked into the image.
RUN DATABASE_URI=postgres://build:build@localhost:5432/build \
    PAYLOAD_SECRET=build-time-placeholder \
    npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MEDIA_DIR=/app/media
RUN addgroup -S njmc && adduser -S njmc -G njmc && mkdir -p /app/media && chown njmc:njmc /app/media
COPY --from=build --chown=njmc:njmc /app/.next/standalone ./
COPY --from=build --chown=njmc:njmc /app/.next/static ./.next/static
COPY --from=build --chown=njmc:njmc /app/public ./public
USER njmc
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
