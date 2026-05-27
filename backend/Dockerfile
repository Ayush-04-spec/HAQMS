# ==========================================
# HAQMS BACKEND - PRODUCTION DOCKERFILE
# ==========================================
# Lightweight Node.js Alpine image for minimal attack surface
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install production dependencies only
# --omit=dev excludes devDependencies for smaller image size
RUN npm ci --omit=dev

# Copy Prisma schema for client generation
COPY prisma ./prisma/

# Generate Prisma Client with type-safe database models
# This compiles the schema into optimized query builders
RUN npx prisma generate

# Copy application source code
COPY . .

# Expose backend API port
EXPOSE 5000

# Health check endpoint for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/auth/me', (r) => {process.exit(r.statusCode === 401 ? 0 : 1)})"

# Start the Express server
CMD ["node", "src/index.js"]
