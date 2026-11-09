# Thuisbios TV page and phone app in one image, for a Linux home server (docs/server/linux-docker.md).
# Both run with `vite preview`: the phone app's relay (/api/tv, /api/requests) lives inside that server,
# so Vite stays in the runtime image. The compose file starts one container per app.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/tv/package.json apps/tv/
COPY apps/remote/package.json apps/remote/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w apps/tv && npm run build -w apps/remote

FROM node:22-alpine
ENV NODE_ENV=production \
    THUISBIOS_TV_CONFIG=/data/samsung-tv.json
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4173 4174
CMD ["npm", "run", "preview", "-w", "apps/remote"]
