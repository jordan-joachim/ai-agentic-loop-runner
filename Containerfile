# syntax=docker/dockerfile:1

# Build stage: compile TypeScript sources
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript -> dist/
RUN npm run build

# -----------------------------------------------------------------------------
# Production stage: minimal runtime image
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the CLI entry point
COPY bin/ ./bin/
RUN chmod +x bin/run-sample-fvt

# Default runtime configuration (overridable at runtime via env)
ENV FVT_MAX_ITERATIONS=5
ENV FVT_TIME_LIMIT_MINUTES=30
ENV FVT_COVERAGE_THRESHOLD=100
ENV FVT_COVERAGE_STALL_DELTA=5

# Declare the bind-mount target for workspace
VOLUME ["/workspace"]

ENTRYPOINT ["node", "bin/run-sample-fvt", "--workspace", "/workspace"]
