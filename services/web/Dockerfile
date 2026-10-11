# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile for @gyde/web (Next.js standalone output)

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable
WORKDIR /repo

# Install dependencies only (cached layer)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/service-kit/package.json packages/service-kit/
COPY services/web/package.json services/web/
RUN --mount=type=cache,id=gyde-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter @gyde/web... --filter @gyde/contracts... --filter @gyde/design-tokens... --filter @gyde/service-kit...

# Build design-tokens (needed by web)
FROM deps AS tokens
COPY packages/design-tokens packages/design-tokens
RUN --mount=type=cache,id=gyde-pnpm-store,target=/pnpm/store \
    pnpm --filter @gyde/design-tokens build

# Generate Prisma/Drizzle client and build web
FROM tokens AS builder
COPY . .
RUN --mount=type=cache,id=gyde-pnpm-store,target=/pnpm/store \
    pnpm --filter @gyde/web db:generate
RUN --mount=type=cache,id=gyde-pnpm-store,target=/pnpm/store \
    pnpm --filter @gyde/web build

# Production image with standalone output
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy standalone output
COPY --from=builder /repo/services/web/public ./public
COPY --from=builder /repo/services/web/.next/standalone ./
COPY --from=builder /repo/services/web/.next/static ./.next/static

# Copy migrations for runtime execution
COPY --from=builder /repo/services/web/drizzle ./drizzle

# Copy entrypoint script
COPY --from=builder /repo/services/web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start server
ENTRYPOINT ["./docker-entrypoint.sh"]