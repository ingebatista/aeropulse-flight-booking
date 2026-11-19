# Seguimiento del carril frontend (Codex)

Este archivo es el brief del carril y su registro de avance. Solo lo edita el carril frontend. Las casillas de [la checklist](../checklist.md) las marca el integrador a partir de la evidencia que anotes aquí.

## Alcance

| Dato | Valor |
| --- | --- |
| Rama | `lane/frontend` |
| Carpeta | `B:\PROYECTOS\DAVIVIENDA\worktrees\lane-frontend` |
| Puedes editar | `frontend/**`, este archivo y tu subsección de `docs/ia.md` |
| No puedes editar | `backend/**`, `packages/shared`, `package.json` y `package-lock.json` de la raíz, `docs/checklist.md` ni los documentos de diseño |

Trabaja directamente en esa carpeta. No crees otro worktree ni otra rama.

## Antes de empezar

1. Lee `AGENTS.md` completo, en especial la sección «Angular 21».
2. Lee [architecture.md](../architecture.md) §4.6, §4.7 y §9, y [contracts-and-open-questions.md](../contracts-and-open-questions.md) completo: es tu fuente de verdad mientras el backend no exista.
3. Ejecuta `npm ci` y `npm run build` en tu worktree. No necesitas Docker ni base de datos para empezar.
4. Comprueba que `packages/shared` trae la etiqueta `contracts-v1` en tu historia (`git describe --tags`).

## Adaptador falso

Mientras un hito del backend no esté en `develop`, el frontend usa un adaptador en memoria que cumple los contratos:

- Un `HttpInterceptorFn` que atiende `/api/*` y una fábrica de socket inyectable que simula `/ws`.
- Solo se activan con la configuración `fake` de `angular.json`. No son puertos nuevos ni capas nuevas.
- Reproducen lo observable: versiones que solo crecen, vencimiento del bloqueo con `holdExpiresAt` y `serverNow`, `409`, `402`, `422`, eventos duplicados y desordenados.
- Cada capacidad (`search`, `seats`, `realtime`, `booking`, `admin`) se apaga por separado cuando llega su hito real.

## Hitos y tareas

| Hito | Tareas (checklist §6.B) | Se integra con |
| --- | --- | --- |
| F1 | Núcleo, almacenes con fusión por versión, pruebas del almacén y adaptador falso | Nada: todo corre contra el falso |
| F2 | Búsqueda (HU1) | Backend M1 |
| F3 | Mapa de asientos (HU2) y dashboard (HU4) | Backend M2 |
| F4 | Checkout, boleto y consulta (HU3) | Backend M3 |
| F5 | Administración diferida y calidad de UI (§8: teclado, contraste, estados, 360 px) | Backend M4 |

Avisa al integrador al cerrar cada hito para que fusione. Cuando llegue un hito real, apaga la capacidad correspondiente del adaptador y verifica contra el backend.

## Definición de «hecho» por hito

- `npm run build`, `npm test -w frontend` y `npm run lint` pasan en tu worktree, con la salida real pegada en el registro.
- Cada dato (evento o instantánea) se aplica solo si su `version` es mayor que la conocida, y `join` se emite solo en `connect`.
- Cada estado del asiento se distingue por color, icono y etiqueta, y es operable con teclado.
- Las decisiones salen del `code` del error, nunca del texto del mensaje.
- El número de tarjeta no se guarda ni se registra en ningún lado: solo viaja en el cuerpo de la confirmación.

## Reglas del carril

- `packages/shared` está congelado. Si necesitas un cambio, detente en esa tarea y anota un `CCR-n` abajo.
- No agregues dependencias. `socket.io-client` ya está instalado.
- Estado compartido del tiempo real en un único almacén por vuelo. Los contadores del dashboard son un `computed()` de ese almacén.
- Cuando corrijas un error propio o el humano te corrija, anótalo en tu subsección de `docs/ia.md`, antes del marcador `fin carril frontend`.
- Si un problema no cede en unos 30 minutos, detente y explica el bloqueo.
- Las capturas y los resultados con el adaptador falso son **pre-evidencia**: no cierran las verificaciones de la sección 6.C.

## Plantilla de registro

Copia este bloque por hito y por solicitud de cambio de contrato.

```markdown
### F# · fecha
- Hecho: …
- Comando y salida: …
- Capacidades reales (sin adaptador falso): …
- Desviaciones del contrato: ninguna | …
- Cambios que necesita la documentación: ninguno | …

### CCR-# · fecha
- Cambio pedido en `packages/shared`: …
- Motivo y regla afectada: …
- Tarea bloqueada: …
```

## Registro

### F1 · 2026-11-19

- Hecho: identidad de pestaña, cliente HTTP tipado, traducción de errores, suscripción Socket.IO y almacenes con fusión por versión. El mapa y el dashboard podrán compartir el inventario y sus contadores.
- Hecho: configuración `fake` con un interceptor HTTP y una fábrica de socket que comparten el estado en memoria. Los interruptores están en `frontend/src/app/core/transport.providers.fake.ts`. La simulación vive en una instancia de la aplicación, por lo que la prueba de competencia usa dos identificadores en esa misma instancia.
- Comandos y salida:

  | Comando | Salida |
  | --- | --- |
  | `npm ci` | `added 1143 packages, and audited 1147 packages in 4m` |
  | `npm run build` | `webpack 5.106.2 compiled successfully` para API y migraciones. Angular terminó con `Application bundle generation complete.` |
  | `npm run build -w frontend -- --configuration fake` | `Application bundle generation complete.` |
  | `npm test -w frontend` | `Test Files  4 passed (4)` · `Tests  12 passed (12)` |
  | `npm run lint` | `eslint .`, código de salida `0`. |
  | Arranque Angular `fake` y petición local | `HTTP 200 · AeroPulse: true` |

- Capacidades reales verificadas: ninguna. `search`, `seats`, `realtime`, `booking` y `admin` están activos en el adaptador falso. Las pruebas son pre-evidencia de F1.
- Desviaciones del contrato: ninguna detectada en los casos probados.
- Cambios que necesita la documentación: ninguno.
