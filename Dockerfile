# ---- build stage ----
    FROM node:22-slim AS build
    WORKDIR /app
    RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
    COPY package*.json ./
    COPY prisma ./prisma
    RUN npm ci
    COPY tsconfig.json ./
    COPY src ./src
    RUN npm run build
    
    # ---- runtime stage ----
    FROM node:22-slim
    WORKDIR /app
    ENV NODE_ENV=production
    RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
    COPY package*.json ./
    COPY prisma ./prisma
    RUN npm ci --omit=dev && npx prisma generate
    COPY --from=build /app/dist ./dist
    EXPOSE 5000
    # Apply pending migrations, then start
    CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]