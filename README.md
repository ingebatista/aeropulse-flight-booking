# AeroPulse Flight Booking

Proyectos base del monorepo, organizados según los [lineamientos de arquitectura](docs/architecture.md).

```text
backend/
  apps/api/           API NestJS 11, módulos HTTP y gateway Socket.IO
    src/              Directorios para flights, inventory, payments y admin
  apps/migrate/       Ejecución de migraciones de TypeORM
  libs/domain/        Espacio para vuelos, asientos y reservas
  libs/events/        Espacio para el bus de eventos
  libs/persistence/   Conexión a PostgreSQL y directorio de migraciones
frontend/             Aplicación Angular 21 standalone y zoneless, con SCSS
  src/app/core/       Espacio para HTTP, socket y estado
  src/app/features/   Directorios de las futuras áreas de la aplicación
packages/shared/      Contratos TypeScript con salida ESM y CommonJS
docker/db-init/       Inicialización del rol PostgreSQL de la API
```

Todos los workspaces usan TypeScript 5.9 y un único `package-lock.json`. La API expone `GET /api/health`, que comprueba PostgreSQL, y el gateway acepta conexiones en `/ws`. El ejecutor de migraciones aplica los permisos del rol `app` (solo datos, sin DDL). Los directorios funcionales quedan reservados para las historias de usuario.

## Ejecutar con Docker Compose

Desde este directorio, con Docker y Compose activos:

```sh
docker compose up --build
```

La aplicación queda en `http://localhost:8080` y la salud de la API en `http://localhost:8080/api/health`. Nginx sirve Angular y reenvía `/api/` y `/ws/` a NestJS. Compose inicia PostgreSQL 17, ejecuta `migrate` con el rol propietario y luego arranca la API con el rol `app`.

`.env.example` lista las variables opcionales. Compose configura el modo de demostración local y publica solo el frontend en la interfaz local. El token de desarrollo previsto para la administración es `aeropulse-admin-dev`. Para ensayar el vencimiento en 30 segundos, se puede definir `HOLD_TTL_SECONDS=30`.

## Desarrollo local

Usa Node.js 24 (desde 24.11) y npm 11 o superior.

Desde la carpeta del proyecto, en este orden:

```sh
npm ci            # instalar dependencias (una vez)
npm run db:dev    # levanta solo PostgreSQL en Docker y aplica las migraciones
npm run dev       # API y frontend con recarga automática (se queda corriendo)
```

| Qué | Dirección |
| --- | --- |
| Aplicación (Angular) | `http://localhost:4200` (usar `localhost`, no `127.0.0.1`) |
| API (NestJS) | `http://localhost:3000/api/health`; el frontend la alcanza por proxy en `/api` |
| PostgreSQL | `localhost:5433` |

`Ctrl + C` detiene la API y el frontend; la base de datos sigue en Docker hasta ejecutar `docker compose down`. No mezcles este modo con `docker compose up --build` (puerto `8080`): ejecuta `docker compose down` antes de cambiar de uno a otro. `npm run build` compila los tres workspaces.

### Conexión a la base de datos (modo desarrollo)

| Dato | Valor |
| --- | --- |
| Host | `localhost` (`127.0.0.1`) |
| Puerto | `5433` (dentro de Docker es `5432`) |
| Base de datos | `flights` |

| Rol | Usuario | Contraseña | Uso |
| --- | --- | --- | --- |
| Propietario | `flights_owner` | `flights_owner_dev` | Administración y migraciones; recomendado para un cliente SQL |
| Aplicación | `app` | `app_dev` | El que usa la API: solo lee y escribe datos, sin DDL |

```text
postgres://flights_owner:flights_owner_dev@localhost:5433/flights
postgres://app:app_dev@localhost:5433/flights
```

Desde la terminal, con el `psql` del contenedor:

```sh
docker compose exec db psql -U flights_owner -d flights
```

- El puerto `5433` solo se publica en `127.0.0.1` y **solo en modo desarrollo** (`compose.dev.yaml`); con `docker compose up --build` la base no queda expuesta.
- Son credenciales de desarrollo local, no secretos. Se pueden cambiar con `DB_OWNER_PASSWORD` y `APP_DB_PASSWORD` en un `.env`, pero PostgreSQL solo las aplica al inicializar el volumen: tras cambiarlas, ejecuta `docker compose down -v`.

Para usar PostgreSQL fuera de Compose, prepara el rol propietario y el rol `app`, configura `DATABASE_URL` y `MIGRATION_DATABASE_URL` en `.env`, y ejecuta `npm run db:migrate` antes de `npm run dev`.

## Pruebas

```sh
npm test
```

Compila `packages/shared`, ejecuta las pruebas del backend (Jest, contra PostgreSQL real levantado con Testcontainers, por lo que requiere Docker) y las del frontend (Vitest mediante `ng test`). Para correr solo una parte: `npm test -w backend` o `npm test -w frontend`.

## Calidad de código

```sh
npm run lint          # ESLint
npm run format:check  # Prettier (npm run format aplica los cambios)
```
