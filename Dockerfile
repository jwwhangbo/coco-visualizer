# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================

# IMPORTANT: Node.js Version Maintenance
# The Node.js runtime is provisioned by pnpm via `pnpm runtime set node <ver>`.
# Regularly bump the version below to the latest LTS for security/compatibility.
FROM ghcr.io/pnpm/pnpm:11 AS dependencies

# Provision the Node.js runtime managed by pnpm.
RUN pnpm runtime set node 22 -g

# Set working directory
WORKDIR /app

# Copy only the files needed to resolve dependencies, to leverage layer caching.
# pnpm-workspace.yaml carries build config (allowBuilds/ignoredBuiltDependencies).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install project dependencies with a frozen lockfile for reproducible builds.
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build Next.js application in standalone mode
# ============================================

FROM ghcr.io/pnpm/pnpm:11 AS builder

RUN pnpm runtime set node 22 -g

# Set working directory
WORKDIR /app

# Copy installed dependencies from the dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source code
COPY . .

ENV NODE_ENV=production

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application (requires `output: "standalone"` in next.config.ts).
# To speed up rebuilds you may cache the build artifacts by adding:
#   RUN --mount=type=cache,target=/app/.next/cache pnpm build
RUN pnpm build

# ============================================
# Stage 3: Run Next.js application
# ============================================

# The standalone server only needs a Node.js runtime (no pnpm), so use the
# official slim Node image — it already ships a non-root `node` user.
FROM node:22-slim AS runner

# Set working directory
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the run time.
# ENV NEXT_TELEMETRY_DISABLED=1

# Copy production assets
COPY --from=builder --chown=node:node /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown node:node .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# If you want to persist the fetch cache generated during the build so that
# cached responses are available immediately on startup, uncomment this line:
# COPY --from=builder --chown=node:node /app/.next/cache ./.next/cache

# Switch to non-root user for security best practices
USER node

# Expose port 3000 to allow HTTP traffic
EXPOSE 3000

# Start Next.js standalone server
CMD ["node", "server.js"]
