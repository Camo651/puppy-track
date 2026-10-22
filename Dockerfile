FROM node:20-bookworm

WORKDIR /app

# Install dependencies and build libs (postinstall), then build backend + frontend.
COPY . .
RUN npm ci
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "packages/backend/dist/index.js"]
