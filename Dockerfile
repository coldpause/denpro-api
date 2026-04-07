# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/server.js"]
