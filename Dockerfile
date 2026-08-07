FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY web ./web
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY data ./data
COPY --from=build /app/web/dist ./web/dist
COPY web/public ./web/public

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
CMD ["node", "--import", "tsx", "server/index.ts"]
