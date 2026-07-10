# ==========================================
# Build Stage
# ==========================================
FROM node:24-trixie-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	python3 \
	make \
	g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY .npmrc ./

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm ci

COPY src ./src
COPY static ./static
COPY data ./data
COPY messages ./messages
COPY project.inlang ./project.inlang
COPY scripts/fix-tv-subtitle-paths.js ./scripts/fix-tv-subtitle-paths.js
COPY server.js svelte.config.js tsconfig.json vite.config.ts ./

ARG APP_VERSION=dev

RUN npm run build

# ==========================================
# Production Dependencies Stage
# ==========================================
FROM node:24-trixie-slim AS prod-deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	python3 \
	make \
	g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY .npmrc ./

# Install only runtime dependencies.
# Keep optional deps, some runtime packages (e.g. impit) ship
# platform-native bindings through optionalDependencies.
RUN npm ci --omit=dev --no-audit --no-fund \
	&& find node_modules -type f -name '*.map' -delete \
	&& find node_modules -type d \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name doc -o -name examples -o -name example \) -prune -exec rm -rf '{}' + \
	&& find node_modules -type d -empty -delete

# Download patched Chromium into a fixed path inside the image so no
# runtime download is needed. PLAYWRIGHT_BROWSERS_PATH tells Patchright
# where to install and where to find the binary at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers
RUN ./node_modules/.bin/patchright install chromium

# ==========================================
# Runtime Stage
# ==========================================
FROM node:24-trixie-slim AS runner
WORKDIR /app

ARG APP_VERSION=dev
ARG APP_SOURCE=https://github.com/MoldyTaint/Cinephage
ARG VCS_REF=unknown
ARG BUILD_CREATED=unknown
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${VCS_REF}
RUN printf '%s\n' "$APP_VERSION" > /app/version.txt

LABEL org.opencontainers.image.title='Cinephage' \
	org.opencontainers.image.description='Self-hosted media management application' \
	org.opencontainers.image.source="${APP_SOURCE}" \
	org.opencontainers.image.revision="${VCS_REF}" \
	org.opencontainers.image.created="${BUILD_CREATED}" \
	org.opencontainers.image.version="${APP_VERSION}"

# Copy node_modules early so we can use the patchright CLI to install exactly
# the Chrome system dependencies for this OS + Chromium version — no manual list.
COPY --from=prod-deps /app/node_modules ./node_modules

RUN apt-get update && apt-get install -y --no-install-recommends \
	ffmpeg \
	gosu \
	curl \
	ca-certificates \
	&& ./node_modules/.bin/patchright install-deps chromium \
	&& rm -rf /var/lib/apt/lists/*

# Install alass (Automatic Language-Agnostic Subtitle Synchronization)
RUN curl -fsSL https://github.com/kaegi/alass/releases/download/v2.0.0/alass-linux64 \
	-o /usr/local/bin/alass-cli \
	&& chmod +x /usr/local/bin/alass-cli

# Runtime does not need npm tooling; remove to shrink attack surface and CVE footprint.
RUN rm -rf /usr/local/lib/node_modules/npm \
	&& rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Pre-create config directories; ownership is fixed at runtime by entrypoint
RUN mkdir -p /config/data /config/cache

COPY --from=prod-deps /app/browsers ./browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./bundled-data
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/cinephage-entrypoint
COPY --chmod=755 docker-script-runner.sh /usr/local/bin/cinephage-script
RUN ln -sf /usr/local/bin/cinephage-script /usr/local/bin/cine-run

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    FFPROBE_PATH=/usr/bin/ffprobe \
    ALASS_PATH=/usr/local/bin/alass-cli \
    DATA_DIR=/config/data \
    INDEXER_DEFINITIONS_PATH=/config/data/indexers/definitions \
    EXTERNAL_LISTS_PRESETS_PATH=/config/data/external-lists/presets

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const port=process.env.PORT||3000;fetch('http://127.0.0.1:'+port+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/cinephage-entrypoint"]
CMD ["node", "server.js"]
