# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml ./
COPY packages/api ./packages/api
COPY tsconfig.base.json ./

# Install dependencies
RUN npm ci

# Build the API
WORKDIR /app/packages/api
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/

# Install production dependencies only
RUN npm ci --production

# Copy built application from builder stage
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "packages/api/dist/server.js"]
