# syntax=docker/dockerfile:1.7
# Development and verification image for the whole monorepo (ADR 0008: Docker first).
#
#   docker build -f infra/docker/dev.Dockerfile --target check .      runs every quality gate
#   docker compose -f infra/compose/compose.yaml watch               runs the stack with live sync
#
# Dependencies live in the image, never in your checkout (which may sit in OneDrive).
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable
WORKDIR /repo

# Cached until the lockfile changes: downloads every dependency into the pnpm store.
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=gyde-pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store

# The whole monorepo with its dependencies installed.
FROM fetch AS dev
COPY . .
RUN --mount=type=cache,id=gyde-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
ENV NODE_ENV=development

# Fails the build when any quality gate fails (same gates as the CI).
FROM dev AS check
RUN pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
