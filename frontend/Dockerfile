FROM node:24.16.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace frontend --workspace @aeropulse/shared --include-workspace-root=false
COPY tsconfig.base.json ./
COPY frontend/ ./frontend/
COPY packages/shared/ ./packages/shared/
RUN npm run build:shared && npm run build -w frontend

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist/frontend/browser/ /usr/share/nginx/html/
