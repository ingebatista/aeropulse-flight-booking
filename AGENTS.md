# AGENTS.md · Reglas para agentes (Claude Code y Codex)

Proyecto: sistema de reservas de vuelos en tiempo real (kata). Diseño: [docs/architecture.md](docs/architecture.md).
Responde y comenta en español. Identificadores de código en inglés.

## Estructura (ya existe; no la reorganices)

- `backend/apps/api`: la única API desplegable. Módulos `flights`, `inventory`, `payments`, `realtime`, `admin`. `backend/apps/migrate`: solo migraciones y *seed*.
- `backend/libs/domain`: tipos y funciones puras (sin imports de NestJS ni TypeORM). `libs/persistence`: entidades, migraciones, *seed*. `libs/events`: `EventBus`.
- `packages/shared`: contratos que cruzan el cable (DTOs, enums, `ServerToClientEvents`).
- La API se conecta con el rol `app` (sin DDL); `migrate` usa el rol propietario.

## Stack fijo (no actualizar sin pedirlo)

Angular 21 · NestJS 11.2.x (CommonJS, modo monorepo, webpack) · TypeScript `~5.9.3` en todo el monorepo (nunca 6.x ni 7.x) · Node.js ≥ 24.11 · PostgreSQL 17 · TypeORM 1.1.3 con `@nestjs/typeorm` 11.0.3 y `pg` · Socket.IO 4.8 · npm workspaces (`backend`, `frontend`, `packages/shared`).

## Cómo trabajar

- Un agente por área: **backend** (`backend/`), **frontend** (`frontend/`). No edites archivos de otra área. `packages/shared` solo lo cambia el humano o con su visto bueno.
- Tareas pequeñas. Termina cada una ejecutando el comando que la verifica (compilar, `npm test`, arrancar) y muestra la salida real.
- Si un problema no cede en ~30 min, detente y explica el bloqueo en lugar de seguir probando.
- No agregues dependencias, capas ni abstracciones que el diseño no pida. Puertos solo en `PaymentGateway` y `EventBus`.
- Anota en `docs/ia.md` (sección «Registro») cada caso donde corregiste un error propio o el humano te corrigió.

## Invariantes de concurrencia (no negociables)

1. **Nunca** *check-then-act*. Bloquear, liberar, expirar y confirmar un asiento son **una sola sentencia `UPDATE` condicional** con `RETURNING`; el resultado se decide por `affected`.
2. El tiempo lo decide el **reloj de PostgreSQL** (`now()`), nunca el del proceso Node ni el del cliente.
3. Toda escritura dentro de una transacción usa el `EntityManager` de `dataSource.transaction()`. **No** uses un repositorio inyectado con `@InjectRepository` dentro de una transacción: escribe fuera de ella.
4. Los eventos se registran durante la transacción y se publican **después del *commit***. La publicación va en `try/catch` con log; nunca produce un `500` sobre una operación ya confirmada.
5. Cada asiento y cada vuelo tiene `version` que **sube en cada cambio** (incluido el barrido y el agotado). Los eventos llevan `version`.
6. La confirmación bloquea primero la fila del asiento y después la del vuelo (`SELECT … FOR UPDATE`); nunca al revés.
7. El estado `CANCELLED` del vuelo se impone en el servidor (hold y confirmación), no solo en la UI.
8. Un cliente tiene un solo bloqueo activo por vuelo; el reintento de su propio bloqueo es idempotente (`200`).

## TypeORM 1.x (no uses sintaxis 0.3)

| No uses | Usa |
| --- | --- |
| `Connection` | `DataSource` |
| `findByIds`, `findOneById` | `findBy({ id: In([...]) })` |
| `@EntityRepository`, `AbstractRepository` | `Repository.extend()` |
| `exist` | `exists` |
| `select` / `relations` como lista de cadenas | sintaxis de objeto |
| opción `join` de `find` | `QueryBuilder` |
| `manager.query('UPDATE … RETURNING')` | `createQueryBuilder().update(...).returning([...])` y leer `affected` y `raw` (`query` devuelve `[filas, cantidad]`) |
| `synchronize: true` | siempre `false`; esquema por migraciones |

No pases `undefined` ni `null` en `where`: en 1.x lanza error.

## Angular 21

Componentes standalone, signals, `computed()`, `@if`/`@for`, detección *zoneless*. Estado compartido del tiempo real en un único almacén por vuelo; los contadores del dashboard son un `computed()` de ese almacén. **Aplica un dato (evento o instantánea) solo si su `version` es mayor que la conocida.** El `join` se emite únicamente en el evento `connect` del socket.

## Seguridad y datos

- No registres ni guardes el número de tarjeta ni el CVV; solo `card_last4`, `card_brand` y la referencia del simulador.
- `ADMIN_TOKEN` se compara con `timingSafeEqual`; con `NODE_ENV=production` la API no arranca si es el valor por defecto.
- `join` del WebSocket solo acepta `search` y `flight:{uuid}`.
- El *seed* genera vuelos desde hoy hasta el último día del mes en curso y trabaja en **UTC**. Su clave natural es `(flight_number, departure_at)`. El catálogo cerrado (`BAQ`, `BOG`, `MDE`) está en `docs/business-rules.md`. Las tablas y restricciones están en `docs/persistence.md`.

## Migraciones, entidades y permisos

- **Webpack junta el backend en un solo archivo:** TypeORM no encuentra nada con patrones de rutas (`dist/**/*.js`). Toda migración nueva se importa y se agrega al arreglo `MIGRATIONS` (`libs/persistence/src/migrations/index.ts`); toda entidad, a `ENTITIES` (`libs/persistence/src/entities/index.ts`).
- Nombre de migración: archivo `<timestamp>-<descripcion>.ts`, clase `<Descripcion><timestamp>` con la propiedad `name` igual a la clase. Escribe `down()`.
- **Permisos del rol `app`:** la migración `AppRoleGrants` define privilegios por defecto, así que toda tabla o secuencia que cree una migración posterior ya queda con `SELECT, INSERT, UPDATE, DELETE` para `app`. No agregues `GRANT` por tabla. La API nunca ejecuta DDL (el rol no puede).

## Pruebas

- **Backend (Jest):** unitarias como `*.spec.ts` junto al código; integración en `backend/test/**/*.spec.ts`. Para PostgreSQL usa `startTestDatabase()` de `backend/test/support/postgres.ts`: levanta `postgres:17-alpine` con el mismo script de roles que Compose y entrega conexiones como propietario (`owner()`) y como `app` (`app()`). Ejecuta las migraciones con `owner` y prueba con `app`, como en producción.
- **Frontend (Vitest vía `ng test`):** `*.spec.ts` junto al componente o servicio, con `TestBed`.
- Nada de *mocks* de la base de datos en pruebas de concurrencia.

## Comandos

```bash
npm ci                      # instalar con el lockfile
npm run build               # compilar los tres workspaces
npm test                    # shared + backend (Jest, Testcontainers; requiere Docker) + frontend (Vitest)
npm test -w backend         # solo backend
npm test -w frontend        # solo frontend
npm run lint                # ESLint (debe quedar en 0 errores)
npm run format              # Prettier; `format:check` solo verifica
docker compose up --build   # entorno completo en http://localhost:8080
```

## Hecho cuando

Compila sin errores, las pruebas de la tarea pasan contra PostgreSQL real, no se rompió ninguna invariante de arriba y se mostró la salida de los comandos.
