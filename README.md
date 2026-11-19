# AeroPulse Flight Booking

Sistema de reservas de vuelos en tiempo real. Permite buscar vuelos, elegir un asiento en un mapa interactivo, bloquearlo de forma temporal, confirmar la reserva con un pago simulado y consultar el boleto. Los cambios de asiento y de estado de un vuelo llegan a todas las pestañas abiertas sin recargar.

- **Frontend:** Angular 21 (standalone, signals y *zoneless*).
- **Backend:** NestJS 11 como monolito modular, con REST y Socket.IO.
- **Base de datos:** PostgreSQL 17. El bloqueo y la confirmación de asientos usan sentencias `UPDATE` condicionales y restricciones únicas, para que nunca haya dos reservas del mismo asiento.
- **Contratos compartidos:** `packages/shared`, con salida ESM y CommonJS.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Arquitectura, concurrencia, tiempo real y decisiones técnicas |
| [docs/ia.md](docs/ia.md) | Uso de inteligencia artificial |
| [docs/business-rules.md](docs/business-rules.md) | Reglas de negocio, catálogo de vuelos y datos iniciales |
| [docs/persistence.md](docs/persistence.md) | Esquema, restricciones y migraciones |
| [docs/contracts-and-open-questions.md](docs/contracts-and-open-questions.md) | Rutas HTTP, eventos de Socket.IO y catálogo de errores |
| [docs/checklist.md](docs/checklist.md) | Seguimiento de tareas y evidencias ([docs/evidence](docs/evidence/README.md)) |

## Arquitectura

```mermaid
flowchart LR
  FE["Angular 21 en el navegador"]
  NG["Nginx<br/>/api/* · /ws"]

  subgraph API["API · NestJS (monolito modular)"]
    CTRL["Controladores REST"]
    SVC["flights · inventory · payments · admin"]
    JOB["Barrido de expirados (1 s)"]
    BUS["EventBus<br/>en proceso, tras commit"]
    RT["Gateway Socket.IO /ws"]
  end

  DB[("PostgreSQL")]

  FE <-->|"HTTP /api"| NG
  FE <-->|"WebSocket /ws"| NG
  NG <--> CTRL
  NG <--> RT
  CTRL --> SVC
  JOB --> SVC
  SVC -- "transacciones · rol app" --> DB
  SVC -- "eventos confirmados" --> BUS --> RT
```

REST atiende las búsquedas y los comandos (bloquear, liberar, confirmar). Socket.IO difunde los cambios de asiento y de estado de vuelo a quienes están suscritos. Cada asiento y cada vuelo llevan una `version` que sube en cada cambio, y el cliente aplica un dato solo si su versión es mayor que la conocida. El tiempo de los bloqueos lo decide el reloj de PostgreSQL. El detalle y la justificación están en [docs/architecture.md](docs/architecture.md).

## Ejecutar con Docker Compose

Es el camino recomendado para evaluar el proyecto. Requiere Docker con Compose v2 y no necesita ningún archivo `.env`.

```sh
docker compose up --build
```

La primera compilación de las imágenes puede tardar varios minutos. Después abre `http://localhost:8080`. La salud de la API está en `http://localhost:8080/api/health`.

Compose arranca cuatro servicios en este orden: `db` (PostgreSQL 17), `migrate` (migraciones y datos iniciales con el rol propietario), `api` (NestJS con el rol `app`, que no puede ejecutar DDL) y `web` (Nginx con Angular, que reenvía `/api/` y `/ws/` a la API). Solo `web` se publica, en `127.0.0.1:8080`.

Para detener todo: `docker compose down`. Para borrar también los datos y volver a sembrar desde cero: `docker compose down -v`.

### Probar la aplicación

1. **Buscar.** En `Buscar vuelos` elige una ruta con resultados. `BOG → MDE` tiene tres horarios por día.
2. **Elegir asiento.** Abre un vuelo, selecciona un asiento y se bloquea para ti. En la pestaña de otro cliente aparece como «Bloqueado» sin recargar.
3. **Probar dos clientes.** Abre dos pestañas escribiendo la dirección en la barra. No uses «Duplicar pestaña»: copiaría el `sessionStorage` y compartiría el identificador de cliente.
4. **Confirmar.** Entra al checkout, escribe nombre y apellido y usa una de las tarjetas que muestra la pantalla: `4242 4242 4242 4242` se aprueba y `4000 0000 0000 0002` se rechaza (el asiento sigue bloqueado).
5. **Consultar el boleto.** En `Consultar boleto`, con el código de reserva y el apellido.
6. **Ver el vencimiento.** El bloqueo dura 300 segundos. Para verlo en 30, arranca con `HOLD_TTL_SECONDS=30` (ver más abajo).
7. **Ver «Agotado».** El vuelo `AP105` (`BOG → MDE`, 22:30 UTC) tiene solo seis asientos. Reserva los seis en una pestaña y mira cómo pasa a «Agotado» en el listado abierto en otra.
8. **Administración.** En `/admin/acceso` entra con el token `aeropulse-admin-dev` y cambia el estado de un vuelo a retrasado o cancelado. El cambio llega a las pestañas de búsqueda.

Las horas de salida y de llegada se muestran en UTC.

### Variables opcionales

Todas tienen valor por defecto; la lista completa está en [.env.example](.env.example). Se pueden definir en un archivo `.env` o en el entorno del shell.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `WEB_PORT` | `8080` | Puerto del frontend en el host |
| `HOLD_TTL_SECONDS` | `300` | Duración del bloqueo de un asiento |
| `ADMIN_TOKEN` | `aeropulse-admin-dev` | Token del área de administración |
| `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_HOLD`, `RATE_LIMIT_CONFIRM`, `RATE_LIMIT_ADMIN` | 120, 30, 10 y 30 | Solicitudes por minuto, por ruta y por IP |

Con `APP_NODE_ENV=production` la API se niega a arrancar si `ADMIN_TOKEN` es el valor de desarrollo.

Los datos iniciales cubren desde el día en que corre el *seed* hasta el último día del mes en curso, en UTC. Es una limitación conocida: el último día del mes, tras la salida de `AP105`, ya no hay un vuelo de demostración futuro. [docs/business-rules.md](docs/business-rules.md#catálogo-y-datos-iniciales) tiene el catálogo completo.

## Desarrollo local

Requiere Node.js 24 (desde 24.11, ver `.nvmrc`), npm 11 o superior y Docker para PostgreSQL y las pruebas. Desde esta carpeta, en este orden:

```sh
npm ci            # instalar dependencias (una vez)
npm run db:dev    # PostgreSQL en Docker, migraciones y datos iniciales
npm run dev       # API y frontend con recarga automática (se queda corriendo)
```

| Qué | Dirección |
| --- | --- |
| Aplicación (Angular) | `http://localhost:4200` (usa `localhost`, no `127.0.0.1`) |
| API (NestJS) | `http://localhost:3000/api/health`; el frontend la alcanza por proxy en `/api` |
| PostgreSQL | `localhost:5433` |

`Ctrl + C` detiene la API y el frontend; la base de datos sigue en Docker hasta ejecutar `docker compose down`. No mezcles este modo con `docker compose up --build`: ejecuta `docker compose down` antes de cambiar de uno a otro. `npm run build` compila los tres workspaces.

### Conexión a la base de datos (modo desarrollo)

| Dato | Valor |
| --- | --- |
| Host y puerto | `localhost:5433` (dentro de Docker es `5432`) |
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

- El puerto `5433` solo se publica en `127.0.0.1` y solo en modo desarrollo (`compose.dev.yaml`); con `docker compose up --build` la base no queda expuesta.
- Son credenciales de desarrollo local, no secretos. Se pueden cambiar con `DB_OWNER_PASSWORD` y `APP_DB_PASSWORD` en un `.env`, pero PostgreSQL solo las aplica al inicializar el volumen: tras cambiarlas, ejecuta `docker compose down -v`.

Para usar PostgreSQL fuera de Compose, prepara el rol propietario y el rol `app`, configura `DATABASE_URL` y `MIGRATION_DATABASE_URL` en `.env`, y ejecuta `npm run db:migrate` antes de `npm run dev`.

## Pruebas y calidad

```sh
npm test            # shared + backend (Jest) + frontend (Vitest)
npm run lint        # ESLint
npm run format:check
npm run verify      # build, lint, format:check y test, en ese orden
```

Las pruebas del backend usan PostgreSQL 17 real, levantado con Testcontainers, y reproducen las carreras de concurrencia (por ejemplo, 50 bloqueos simultáneos sobre un asiento terminan en un éxito y 49 conflictos). Por eso requieren Docker activo. Se pueden correr por partes con `npm test -w backend` y `npm test -w frontend`. `npm run format` aplica Prettier.

## Estructura

```text
backend/
  apps/api/           API NestJS: flights, inventory, payments, admin y realtime
  apps/migrate/       Ejecutor de migraciones y datos iniciales (rol propietario)
  libs/domain/        Reglas y transiciones puras de vuelos, asientos y reservas
  libs/events/        Puerto EventBus y su adaptador en proceso
  libs/persistence/   Entidades, migraciones, seed y conexión a PostgreSQL
frontend/             Angular 21: búsqueda, mapa de asientos, checkout, ocupación y administración
packages/shared/      Contratos que cruzan el cable (DTOs, errores y eventos)
docker/db-init/       Creación del rol `app` de PostgreSQL
docs/                 Arquitectura, reglas, contratos, evidencias y uso de IA
```

Todos los workspaces usan TypeScript 5.9 y un único `package-lock.json`.
