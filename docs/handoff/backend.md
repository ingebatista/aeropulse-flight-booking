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

_(sin entradas)_
