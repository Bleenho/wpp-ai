# wpp-ai — imagem de produção (multi-stage).
FROM node:20-slim AS base
WORKDIR /app
# openssl é exigido pelos engines do Prisma.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS run
ENV NODE_ENV=production
COPY package*.json ./
# Carrega node_modules do build (já com o Prisma Client gerado + a CLI do Prisma
# para rodar `prisma db push` no deploy).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 8090
CMD ["node", "dist/index.js"]
