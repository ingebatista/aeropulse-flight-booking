# Seguimiento del carril backend (Claude)

Este archivo es el brief del carril y su registro de avance. Solo lo edita el carril backend. Las casillas de [la checklist](../checklist.md) las marca el integrador a partir de la evidencia que anotes aquí.

## Alcance

| Dato | Valor |
| --- | --- |
| Rama | `lane/backend` |
| Carpeta | `B:\PROYECTOS\DAVIVIENDA\worktrees\lane-backend` |
| Puedes editar | `backend/**`, este archivo y tu subsección de `docs/ia.md` |
| No puedes editar | `frontend/**`, `packages/shared`, `package.json` y `package-lock.json` de la raíz, `docs/checklist.md` ni los documentos de diseño |

## Antes de empezar

1. Lee `AGENTS.md` completo, en especial las **8 invariantes de concurrencia** y la tabla de TypeORM 1.x.
2. Lee [architecture.md](../architecture.md) §3 a §5, [persistence.md](../persistence.md) y [contracts-and-open-questions.md](../contracts-and-open-questions.md).
3. Ejecuta `npm ci` y `npm run build` en tu worktree. Docker debe estar activo: las pruebas usan Testcontainers.
4. Comprueba que `packages/shared` trae la etiqueta `contracts-v1` en tu historia (`git describe --tags`).

## Hitos y tareas

Cada tarea está definida en la sección indicada de la checklist. Aquí solo se listan el orden y la salida de cada hito.

| Hito | Tareas (checklist) | Cierra con |
| --- | --- | --- |
| M1 | §5 M1 y §6.A M1: entidades, migración, seed, validación, errores, `GET /api/flights` | Pruebas de migración (aplicar, revertir, aplicar) y del seed con los dos roles |
| M2 | §5 M2 y §6.A M2: funciones puras, `EventBus`, bloqueo, liberación, barrido, gateway | 50 `hold` simultáneos, expiración, un bloqueo por cliente y vuelo cancelado, todo contra PostgreSQL real |
| M3 | §5 M3 y §6.A M3: código de reserva, Luhn, pago simulado, confirmación, boleto, agotado | *Rollback*, idempotencia y 20 confirmaciones simultáneas |
| M4 | §5 M4 y §6.A M4: registros, administración, límite de tasa, `helmet` y pruebas con `socket.io-client` | `npm run build`, `npm test` y `npm run lint` limpios |

Avisa al integrador al cerrar cada hito para que fusione. El frontend apaga su adaptador falso solo cuando el hito llega a `develop`.

## Definición de «hecho» por hito

- `npm run build`, `npm test` y `npm run lint` pasan en tu worktree, con la salida real pegada en el registro.
- Ninguna invariante de `AGENTS.md` quedó rota.
- Las respuestas, los eventos y los códigos de error coinciden con los contratos. Si algo no encaja, no lo cambies en silencio: abre un `CCR`.
- Ningún mensaje, registro ni evento expone `clientId`, `holdToken`, datos del pasajero ni tarjetas.

## Reglas del carril

- `packages/shared` está congelado. Si necesitas un cambio, detente en esa tarea y anota un `CCR-n` abajo.
- No agregues dependencias. Las que el diseño pide ya vienen instaladas desde M0.
- Registra cada migración en `MIGRATIONS` y cada entidad en `ENTITIES`.
- `npm run db:dev` usa el puerto fijo `5433`. Pregunta al integrador antes de ejecutarlo, porque solo un worktree puede tenerlo.
- Cuando corrijas un error propio o el humano te corrija, anótalo en tu subsección de `docs/ia.md`, antes del marcador `fin carril backend`.
- Si un problema no cede en unos 30 minutos, detente y explica el bloqueo.

## Plantilla de registro

Copia este bloque por hito y por solicitud de cambio de contrato.

```markdown
### M# · fecha
- Hecho: …
- Comando y salida: …
- Desviaciones del contrato: ninguna | …
- Cambios que necesita la documentación: ninguno | …

### CCR-# · fecha
- Cambio pedido en `packages/shared`: …
- Motivo y regla afectada: …
- Tarea bloqueada: …
```

## Registro

### M1 · 2026-11-19
- Hecho:
  - Entidades `FlightEntity`, `SeatEntity` y `BookingEntity` en `ENTITIES`, y migración `BookingSchema1794960000000` en `MIGRATIONS` (tablas, restricciones nombradas, los 3 índices y `down()` sin `CASCADE`).
  - *Seed* idempotente (`libs/persistence/src/seed`): catálogo de 10 horarios en 6 rutas, ventana UTC hasta fin de mes y vuelo de demostración `AP105` (6 asientos, 22:30 UTC). Usa `now()` de PostgreSQL, una transacción y `ON CONFLICT DO NOTHING`. `apps/migrate` lo ejecuta tras las migraciones.
  - Validación estricta (`ApiValidationPipe`), filtro global `ApiExceptionFilter` con la forma `{ error: { code, message, fields? } }`, `configureApp()` compartido entre `main.ts` y las pruebas, y `GET /api/flights`.
- Comando y salida (worktree `lane-backend`, 2026-11-19):
  - `npm run build -w backend` → `webpack compiled successfully` (api y migrate).
  - `npm test -w backend -- --runInBand` → `Test Suites: 6 passed, 6 total · Tests: 70 passed, 70 total` (PostgreSQL 17 real con Testcontainers: migración aplicar/revertir/aplicar con ambos roles, integridad, *seed* y API).
  - `npm run lint` → 0 errores. `prettier --check "backend/**/*.ts"` → `All matched files use Prettier code style!`.
- Compose local (2026-11-19, con permiso del humano para el puerto `5433`; sin `.env`):
  - `npm run db:dev` → `db` *healthy* y `migrate` terminó. Log de `migrate`: `Migraciones aplicadas: 2` · `Seed: 120 vuelos en la ventana, 120 vuelos y 2664 asientos nuevos`.
  - `npm run db:migrate` (segunda vez, desde el host) → `Migraciones aplicadas: 0` · `Seed: 120 vuelos en la ventana, 0 vuelos y 0 asientos nuevos`.
  - API compilada contra esa base: `GET /api/health` → `{"status":"ok"}`; `GET /api/flights?origin=BOG&destination=MDE&date=2026-11-19` → `AP101`, `AP103` y `AP105` en orden; un origen igual al destino y `date=2026-02-30` → `400` con `query.destination` y `query.date` `INVALID`.
  - Después: `docker compose … down` (volumen conservado) para liberar el puerto.
- Desviaciones del contrato: una. Una ruta inexistente responde `404` con `code: 'INTERNAL_ERROR'` (provisional; ver CCR-1).
- Cambios que necesita la documentación:
  - `business-rules.md` / `persistence.md`: añadir la tabla del catálogo (números `AP101`–`AP302`, horarios UTC, duraciones y tarifas) que M1 fijó con visto bueno del humano.
  - `npm run format:check` de la raíz marca `packages/shared/src/index.ts` (viene de M0; el carril no lo toca). Lo resuelve el integrador.

### CCR-1 · 2026-11-19
- Cambio pedido en `packages/shared`: agregar `NOT_FOUND` a `ERROR_CODES` y `404` a `ERROR_HTTP_STATUS` para rutas inexistentes (`GET /api/xyz`).
- Motivo y regla afectada: el catálogo de errores de `contracts-and-open-questions.md` no cubre un `404` genérico y toda respuesta de error debe llevar un `code`. Se decidió responder con `INTERNAL_ERROR` y estado `404` mientras tanto.
- Tarea bloqueada: ninguna; solo queda provisional el código de las rutas inexistentes (`ApiExceptionFilter`).

### M2 · 2026-11-19
- Hecho:
  - `libs/domain/src/seats`: `SeatState`, `isHoldActive` (vencido en `hold_expires_at <= now`), transiciones puras `canHold/canRelease/canExpire` y `applyHold/applyRelease/applyExpire`, y `decideHoldFallback` / `decideReleaseFallback` para elegir la respuesta cuando el `UPDATE` no afecta filas.
  - `libs/events`: puerto `EventBus`, adaptador `InProcessEventBus` (RxJS; un suscriptor que falla se registra y no afecta a los demás) y `publishAll` tras el commit con `try/catch` y log. `EventsModule` global en la API.
  - `apps/api/src/inventory`:
    - `HoldService.hold`: transacción `READ COMMITTED` con los dos `UPDATE` condicionales de arch §4.3 (liberar el previo y adquirir con `now() + make_interval`), `FOR SHARE` del vuelo después del asiento y `serverNow` de la misma transacción. Cero filas → *rollback* y lectura que elige `200`/`404`/`409`. `40P01` y `23505` de `seats_flight_holder_uidx` comparten un reintento.
    - `HoldService.release`: un `UPDATE` condicional; si no afecta filas, `404`, `409 HOLD_NOT_OWNED` o `204` sin evento.
    - `ExpirySweeper`: `setInterval` de 1 s sin solapes, un solo `UPDATE … RETURNING`, un `AVAILABLE` por fila.
    - `SnapshotService`: `REPEATABLE READ` de solo lectura con `flight`, `seats`, `myHold` y `serverNow`.
  - HTTP: `POST` y `DELETE /api/flights/{flightId}/seats/{seatCode}/hold`, con `SeatParamsDto`, `@ClientId()`/`@HoldToken()` (UUID v4, minúsculas, repetidos con `headersDistinct`) y `RejectBodyGuard`.
  - Socket.IO: `RealtimeGateway` en `/ws` solo con `websocket`; middleware del *handshake* para `auth.clientId`; `join` que entra a la sala antes de leer y sale si falla; difusión desde el `EventBus`.
- Comando y salida (worktree `lane-backend`, 2026-11-19):
  - `npm run build -w backend` → `webpack compiled successfully` (api y migrate).
  - `npm test -w backend -- --runInBand` → `Test Suites: 16 passed, 16 total · Tests: 137 passed, 137 total`.
  - `npm run lint` → 0 errores. `prettier --check "backend/**/*.ts"` → `All matched files use Prettier code style!`.
- Evidencia por tarea de la checklist (§5 M2), todo contra PostgreSQL 17 real con el rol `app`:
  - Funciones puras con pruebas unitarias → `libs/domain/src/seats/transitions.spec.ts` y `decisions.spec.ts` (21 pruebas).
  - 50 `hold` simultáneos → `test/inventory/hold-concurrency.spec.ts`: 1 × `201`, 49 × `409 SEAT_UNAVAILABLE`, una fila `HELD` del ganador (versión 2) y un solo `seat.changed`.
  - Expiración sin clientes conectados → `test/inventory/expiry.spec.ts`: el temporizador real libera el vencido con un solo `AVAILABLE`; no toca los vigentes; la adquisición directa de un vencido emite solo `HELD` con versión mayor; `HOLD_TTL_SECONDS=30` da 30 s exactos entre `serverNow` y `holdExpiresAt`.
  - Reintento idempotente, titularidad, un bloqueo por cliente y vuelo → `test/inventory/hold.spec.ts` y `release.spec.ts`: `200` con el mismo token, vencimiento y versión, sin evento; cambiar de asiento emite dos eventos; un asiento ajeno da `409` y conserva el previo; dos asientos en paralelo del mismo cliente terminan con un solo `HELD` (20 rondas, sin `500`, último evento = estado de la base); doble liberación → `204` ×2 y un evento; liberación tardía → `409 HOLD_NOT_OWNED` sin tocar el bloqueo nuevo.
  - Interbloqueo al cambiar de asiento → `test/inventory/hold-deadlock.spec.ts`: determinista (la transacción de la prueba sube su `deadlock_timeout`), PostgreSQL aborta el intento de la API, el reintento responde `201` y solo hay un evento por asiento.
  - Vuelo cancelado → `test/inventory/cancelled.spec.ts`: `409 FLIGHT_CANCELLED`; el bloqueo previo del cliente se conserva; carrera determinista con la cancelación sin confirmar: el `hold` espera en `FOR SHARE`, revierte y deja el asiento y su versión intactos, sin eventos.
  - *Gateway* (§6.A M2) → `test/realtime/realtime.spec.ts` (9 pruebas con `socket.io-client`): `join('search')`, instantánea con `myHold` solo para el titular, `seat.changed` solo en la sala del vuelo y sin datos privados, salas inválidas, `FLIGHT_NOT_FOUND` sin dejar la suscripción y `connect_error` con `VALIDATION_ERROR`.
- Desviaciones del contrato: ninguna. Decisiones que el contrato no fijaba:
  - Los encabezados se informan en `fields` como `header.x-client-id` y `header.x-hold-token` (mismo patrón que `query.*`, `param.*` y `body.*`).
  - Un cuerpo en `hold` o `release` responde `400` con `{ field: 'body', reason: 'UNEXPECTED' }`.
  - Variable nueva solo para pruebas: `SWEEP_INTERVAL_MS` (1000 por defecto; `0` apaga el barrido automático). No hace falta en Compose.
- Cambios que necesita la documentación: añadir a `contracts-and-open-questions.md` la convención `header.<nombre>` de `fields` si el integrador la acepta.

### CCR-2 · 2026-11-19
- Cambio pedido: declarar `socket.io-client` (misma versión que el frontend, 4.8) como `devDependency` de `backend/package.json` y actualizar `package-lock.json`. No toca `packages/shared`, pero sí el *lockfile*, que es del integrador.
- Motivo y regla afectada: `test/realtime/realtime.spec.ts` lo importa desde el `node_modules` de la raíz, donde hoy llega solo porque lo instala el frontend (decisión del humano del 2026-11-19 para no bloquear M2). Sin declararlo, la prueba depende del *hoisting* de npm.
- Tarea bloqueada: ninguna; la prueba ya pasa. También la usará la verificación de §6.A M4.

### M3 · 2026-11-19
- Hecho:
  - `libs/domain/src/bookings`: `isValidLuhn`, `generateBookingCode` (6 caracteres del alfabeto del contrato, `byte % 32` sin sesgo) y `normalizeBookingCode`, `cardBrand`/`cardLast4`, `normalizeName`/`isValidName`/`sameLastName` (NFC, recorte, sin caracteres de control y acentos conservados), `requestHash` (SHA-256 de la huella de arch §4.4) y `decideConfirmFallback`.
  - `apps/api/src/payments`: puerto `PaymentGateway` y `SimulatedPaymentGateway`, que aprueba una tarjeta válida terminada en `4242`, rechaza el resto y nunca guarda ni registra el número.
  - `BookingService.confirm`:
    - replay por `Idempotency-Key` (`200` con la misma huella y `422` con otra);
    - precomprobación y pago fuera de la transacción (`402` no guarda nada);
    - transacción con `UPDATE` `HELD → BOOKED` condicional, `FOR UPDATE` del vuelo después del asiento, `INSERT` de la reserva, conteo de asientos pendientes y `sold_out` con su versión;
    - eventos tras el commit;
    - ante 0 filas o `23505` de la clave, *rollback* y nueva consulta de la clave;
    - ante colisión del código, reintento de la transacción completa (hasta 3).
  - `BookingService.findTicket`: un código inexistente o un apellido distinto responden igual, `404 BOOKING_NOT_FOUND`.
  - HTTP:
    - `POST /api/bookings/confirm` usa `ConfirmBookingDto` con `PassengerDto` y `PaymentDto` anidados, `@IdempotencyKey()` y `RequireJsonGuard` (`415`);
    - `GET /api/bookings/:code?lastName=` usa `RejectBodyGuard`;
    - `ApiValidationPipe` responde `body` `REQUIRED`/`INVALID` ante un cuerpo ausente o que no es un objeto.
- Comando y salida (worktree `lane-backend`, 2026-11-19):
  - `npm run build -w backend` → `webpack compiled successfully` (api y migrate).
  - `npm test -w backend -- --runInBand` → `Test Suites: 24 passed, 24 total · Tests: 205 passed, 205 total`.
  - `npm run lint` → 0 errores. `prettier --check "backend/**/*.ts"` → `All matched files use Prettier code style!`.
- Evidencia por tarea de la checklist (§5 M3), todo contra PostgreSQL 17 real con el rol `app`:
  - Código de reserva y Luhn con pruebas unitarias → `libs/domain/src/bookings/bookings.spec.ts` (37 pruebas) y `apps/api/src/payments/simulated-payment-gateway.spec.ts`.
  - Atomicidad y *rollback* → `test/bookings/confirm-rollback.spec.ts`: un *trigger* hace fallar el `INSERT` de la reserva. Resultado: `500 INTERNAL_ERROR` sin el detalle de la base, asiento `HELD` en la misma versión, sin reserva ni eventos. Después la misma clave confirma.
  - Idempotencia, titularidad y agotado:
    - `test/bookings/confirm-concurrency.spec.ts`: 20 confirmaciones simultáneas con la misma clave dan 1 × `201`, 19 × `200`, el mismo código, una reserva y un evento; la misma clave en dos asientos da `201` + `422` y el perdedor sigue `HELD` en su versión;
    - `test/bookings/confirm.spec.ts`: reintentos, `422`, `402`, bloqueo vencido o ajeno (`409 HOLD_INACTIVE`) y validación;
    - `test/bookings/sold-out.spec.ts`: dos confirmaciones simultáneas de los dos últimos asientos de `AP105` ponen `sold_out = true` con una sola subida de versión y un único `flight.status_changed`, recibido también en la sala `search` con `socket.io-client`.
  - Vuelo cancelado → `test/bookings/confirm-cancelled.spec.ts`: `409 FLIGHT_CANCELLED`; carrera determinista con la cancelación sin confirmar: la confirmación espera en `FOR UPDATE`, revierte y deja el asiento `HELD` sin reserva ni eventos.
  - Consulta del boleto (§6.A M3) → `test/bookings/ticket.spec.ts`: mismo boleto, código en minúscula, apellido sin distinguir mayúsculas pero con acentos (`Gomez` ≠ `Gómez`) y `404` idéntico en ambos casos.
- Desviaciones del contrato: ninguna. Decisiones que el contrato no fijaba:
  - Marca de tarjeta por prefijo: `VISA` (4), `MASTERCARD` (51–55 y 2221–2720), `AMEX` (34 y 37) u `OTHER`.
  - Referencia del simulador: `SIM-<uuid>`, 40 caracteres (4 + 36), que caben justo en `payment_reference varchar(40)`.
  - Ante una colisión del código de reserva se reintenta la transacción completa, porque en PostgreSQL un error aborta la transacción.
  - Si la precomprobación falla, también se vuelve a consultar la clave antes de responder. Así, un reintento que llega justo después del commit de otro con la misma clave recibe `200` y no `409`.
- Cambios que necesita la documentación: ninguno obligatorio. Se puede añadir a arch §4.4 la regla de marcas y el formato de la referencia si el integrador lo considera útil.

### M4 · 2026-11-19
- Hecho:
  - `libs/domain/src/flights`: `canChangeFlightStatus`, `allowedOrigins` y `decideStatusChange` (`SCHEDULED → DELAYED | CANCELLED`, `DELAYED → CANCELLED`, `CANCELLED` terminal).
  - `FlightsService.changeStatus`: un solo `UPDATE` condicional que solo toma la fila del vuelo y sube la versión, y `flight.status_changed` tras el commit. Sin filas afectadas: `404`, `200` con la versión actual y sin evento (mismo estado) o `409 INVALID_FLIGHT_TRANSITION`.
  - `PATCH /api/admin/flights/:flightId/status` (`AdminFlightsController` en `AdminHttpModule`): `AdminTokenGuard` con `timingSafeEqual` sobre SHA-256, `401` con `WWW-Authenticate: Bearer`, `RequireJsonGuard` y DTO con `DELAYED`/`CANCELLED`.
  - Arranque seguro: `readAdminToken` impide arrancar con `NODE_ENV=production` si `ADMIN_TOKEN` falta o es `aeropulse-admin-dev`. El guard es proveedor de `AdminHttpModule`, así que se valida al iniciar.
  - Límite de tasa: `ThrottlerModule` con un único *throttler* `default` (cabecera `Retry-After` sin sufijo) y `HttpThrottlerGuard` global que omite el *gateway*. Límites más estrictos en `hold`, `confirm` y `/api/admin`. `ApiExceptionFilter` traduce a `429 RATE_LIMITED`.
  - `helmet()` en `configureApp()`.
  - `ApiError` admite cabeceras y el filtro las envía.
  - Registros con `Logger`: bloqueo (adquirido, repetido, rechazado), liberación (hecha, sin cambios, rechazada), barrido (solo si liberó algo), confirmación (confirmada, repetida, rechazada con su código, agotado) y cambio de estado del vuelo. Solo llevan vuelo, asiento, versión y código de error.
- Comando y salida (worktree `lane-backend`, 2026-11-19, desde la raíz):
  - `npm run build` → shared, backend (`webpack compiled successfully` para api y migrate) y frontend (`Application bundle generation complete`).
  - `npm test` → backend `Test Suites: 30 passed, 30 total · Tests: 247 passed, 247 total`; frontend `Test Files 1 passed (1)`.
  - `npm run lint` → 0 errores. `prettier --check "backend/**/*.ts"` → sin diferencias.
- Evidencia por tarea de la checklist:
  - §5 M4, registros → `test/logging/no-secrets.spec.ts`: recorre bloqueo, liberación, conflicto, pago rechazado, confirmación, reintento, `422`, barrido y `PATCH` con un `LoggerService` que captura todo. Hay un registro de cada operación y ninguno contiene `clientId`, `holdToken`, `Idempotency-Key`, el token de administración, nombres, tarjetas, últimos 4 dígitos ni el código de reserva.
  - §6.A M4 [I] →
    - `test/admin/flight-status.spec.ts` (16 pruebas): transiciones, versión y eventos, mismo estado sin evento, `409`, `soldOut` conservado, `hold` rechazado tras cancelar, 15 rondas de cancelación y `hold` simultáneos (o el `hold` gana antes, o revierte con el asiento intacto), `401` en todas sus variantes, `400`, `404` y `415`;
    - `test/admin/startup.spec.ts`: `readAdminToken` y la API completa, que no arranca en producción con el token de desarrollo y sí con uno propio;
    - `test/http/rate-limit.spec.ts`: `429 RATE_LIMITED` con `Retry-After` en búsqueda, `hold`, `confirm` y admin; una IP no afecta a otra; el *gateway* no se limita; cabeceras de `helmet`; un límite inválido detiene el arranque.
  - §6.A M4 [V] → `test/realtime/realtime-e2e.spec.ts` con `socket.io-client`:
    - `join` tras «recargar» devuelve `myHold` del titular;
    - un evento publicado mientras la instantánea espera (tabla `seats` bloqueada) llega **antes** del *ack* y con una versión igual o mayor que la de la instantánea;
    - el `PATCH` de administración llega como `flight.status_changed` a la sala `search`.
- Desviaciones del contrato: ninguna. Decisiones que el contrato no fijaba:
  - Límites por defecto aprobados por el humano, por minuto y por IP: global 120, `hold` 30, `confirm` 10 y admin 30. En `@nestjs/throttler` 6 el contador es **por ruta** y por IP.
  - `401` también con otro esquema distinto de `Bearer`. El límite de admin se aplica antes de autenticar (los guards globales van primero).
- Cambios que necesita la documentación (archivos del integrador):
  - `.env.example` y `docker-compose.yml`: declarar `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_HOLD`, `RATE_LIMIT_CONFIRM` y `RATE_LIMIT_ADMIN` (opcionales, con los valores por defecto de arriba).
  - arch §5: anotar que el límite es por ruta y por IP, y los valores.
- **Estado del carril:** M1 a M4 completos en `lane/backend`. Listo para que el integrador fusione en `develop` e inicie M5. Siguen abiertos CCR-1 y CCR-2.
