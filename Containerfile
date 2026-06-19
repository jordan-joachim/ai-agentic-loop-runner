# syntax=docker/dockerfile:1

# Optional build context that provides the generic @agentic-loop/harness
# package sources. When building locally, pass:
#   --build-context harness=/absolute/path/to/AgenticLoop
# When the harness package is published to npm, this context can be omitted.
#
# Build example:
#   podman build -f Containerfile --build-arg AGENT_RUNTIME=ollama-droid -t ai-agentic-loop-runner:latest .
FROM scratch AS harness
COPY . /harness

# Build stage: compile TypeScript sources
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# If a local harness package build context was provided, replace the npm/symlink
# resolution with a real copy and build it. This keeps the production image
# self-contained when built from the runner repo.
RUN --mount=type=bind,from=harness,source=.,target=/harness-package,readonly \
    if [ -f /harness-package/package.json ] && [ -d /harness-package/src ]; then \
      echo "[build] Installing local harness package from build context" && \
      rm -rf /app/node_modules/@agentic-loop/harness && \
      mkdir -p /app/node_modules/@agentic-loop/harness && \
      cp -R /harness-package/. /app/node_modules/@agentic-loop/harness/ && \
      (cd /app/node_modules/@agentic-loop/harness && npm run build); \
    else \
      echo "[build] No local harness build context provided; using npm resolution" ; \
    fi

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript -> dist/
RUN npm run build

# -----------------------------------------------------------------------------
# Production stage: minimal runtime image
FROM node:22-alpine

WORKDIR /app

# Build-time agent runtime selection. The harness reads HARNESS_AGENT_RUNTIME
# at startup, so the same image family can be built for different runtimes.
# Supported values: mock, droid, ollama-droid, kilo
ARG AGENT_RUNTIME=mock
ENV HARNESS_AGENT_RUNTIME=${AGENT_RUNTIME}

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

# If a local harness package build context was provided, install it into the
# production node_modules so the generic bin/harness entrypoint can resolve it.
RUN --mount=type=bind,from=harness,source=.,target=/harness-package,readonly \
    if [ -f /harness-package/package.json ] && [ -d /harness-package/src ]; then \
      echo "[production] Installing local harness package from build context" && \
      rm -rf /app/node_modules/@agentic-loop/harness && \
      mkdir -p /app/node_modules/@agentic-loop/harness && \
      cp -R /harness-package/. /app/node_modules/@agentic-loop/harness/ && \
      (cd /app/node_modules/@agentic-loop/harness && npm run build); \
    else \
      echo "[production] No local harness build context provided; using npm resolution" ; \
    fi

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the CLI entry point
COPY bin/ ./bin/
RUN chmod +x bin/harness

# Default harness configuration (overridable at runtime via env)
ENV HARNESS_MAX_ITERATIONS=5
ENV HARNESS_TIME_LIMIT_MINUTES=30
ENV HARNESS_WORKSPACE=/workspace

# Declare the bind-mount target for workspace
VOLUME ["/workspace"]

ENTRYPOINT ["node", "bin/harness", "--workspace", "/workspace"]
