# =============================================================================
# PERSONA SSO - Development Dockerfile
# =============================================================================
# Simplified for development - uses tsx for direct TypeScript execution

FROM node:20-alpine
WORKDIR /app

# Workaround for SSL certificate issues in corporate/proxy environments
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
RUN npm config set strict-ssl false

# Install dependencies for native modules AND OpenSSL for Prisma
RUN apk add --no-cache libc6-compat openssl openssl-dev

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including dev for tsx)
RUN npm ci && npm cache clean --force

# Generate Prisma client with correct binary target
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN npx prisma generate

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 persona
RUN chown -R persona:nodejs /app

# Switch to non-root user
USER persona

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start with tsx (TypeScript execution without compilation)
CMD ["npx", "tsx", "src/index.ts"]
