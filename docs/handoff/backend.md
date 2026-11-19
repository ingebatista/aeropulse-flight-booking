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
- Pendiente de M1: arrancar PostgreSQL con Compose (`npm run db:dev`, puerto `5433` compartido) y `npm run db:migrate` dos veces. No lo ejecuté sin permiso del integrador; las pruebas ya cubren el mismo flujo con la imagen `postgres:17-alpine` y el script de roles de Compose.
- Desviaciones del contrato: una. Una ruta inexistente responde `404` con `code: 'INTERNAL_ERROR'` (provisional; ver CCR-1).
- Cambios que necesita la documentación:
  - `business-rules.md` / `persistence.md`: añadir la tabla del catálogo (números `AP101`–`AP302`, horarios UTC, duraciones y tarifas) que M1 fijó con visto bueno del humano.
  - `npm run format:check` de la raíz marca `packages/shared/src/index.ts` (viene de M0; el carril no lo toca). Lo resuelve el integrador.

### CCR-1 · 2026-11-19
- Cambio pedido en `packages/shared`: agregar `NOT_FOUND` a `ERROR_CODES` y `404` a `ERROR_HTTP_STATUS` para rutas inexistentes (`GET /api/xyz`).
- Motivo y regla afectada: el catálogo de errores de `contracts-and-open-questions.md` no cubre un `404` genérico y toda respuesta de error debe llevar un `code`. Se decidió responder con `INTERNAL_ERROR` y estado `404` mientras tanto.
- Tarea bloqueada: ninguna; solo queda provisional el código de las rutas inexistentes (`ApiExceptionFilter`).
