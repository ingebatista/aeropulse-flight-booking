FROM node:24.16.0-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/

FROM dependencies AS build
ARG APP=api
RUN npm ci --workspace backend --workspace @aeropulse/shared --include-workspace-root=false
COPY tsconfig.base.json ./
COPY backend/ ./backend/
COPY packages/shared/ ./packages/shared/
RUN npm run build:shared && npm run build:${APP} -w backend

FROM dependencies AS runtime
ARG APP=api
ENV NODE_ENV=production APP=${APP}
RUN npm ci --omit=dev --workspace backend --workspace @aeropulse/shared --include-workspace-root=false
COPY --from=build /app/backend/dist/apps/${APP}/ ./backend/dist/apps/${APP}/
COPY --from=build /app/packages/shared/dist/ ./packages/shared/dist/
WORKDIR /app/backend
USER node
# Arranca la aplicación con la que se construyó la imagen (APP=api o APP=migrate).
CMD ["sh", "-c", "exec node dist/apps/${APP}/main.js"]
