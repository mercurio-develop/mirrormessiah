# Stage 1: Dependencies
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm rebuild better-sqlite3 --build-from-source

# Stage 2: Builder
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure we are building in a clean state without any host database
RUN rm -f media.db media.db-shm media.db-wal
# Create a dummy for build-time tracing only
RUN touch media.db
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build
# Remove the dummy after build so it doesn't get copied to standalone
RUN rm -f media.db

# Stage 3: Runner
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# Install production dependencies: ffprobe and python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Install CLI dependencies
RUN pip3 install --no-cache-dir --root-user-action=ignore requests python-dotenv beautifulsoup4 --break-system-packages

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Create data directory and ensure permissions
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy scripts for CLI management
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV DB_PATH=/app/data/media.db

HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/login', r => process.exit(r.statusCode < 400 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
