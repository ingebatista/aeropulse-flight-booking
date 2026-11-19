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

Durante los hitos de frontend se usó un adaptador en memoria mientras llegaba el backend a `develop`:

- Un `HttpInterceptorFn` que atiende `/api/*` y una fábrica de socket inyectable que simula `/ws`.
- Se activaba con la configuración `fake` de `angular.json`.
- Reproducía versiones crecientes, vencimiento del bloqueo con `holdExpiresAt` y `serverNow`, respuestas `409`, `402` y `422`, y eventos duplicados o desordenados.

Con M1–M4 integrados, las cinco capacidades usan el backend real. El perfil `fake` se retiró de Angular y los simuladores HTTP y Socket.IO se conservan en las pruebas del transporte.

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

### F2 · 2026-11-19

- Hecho: búsqueda de vuelos en la ruta inicial con filtros, intercambio de origen y destino, días adyacentes y resultados en UTC y COP. La vista actualiza el estado operativo y «Agotado» por separado, mantiene las filas al reconectar y ofrece reintento.
- La prueba de componente cubre el reconocimiento de `search`, la validación y el envío de filtros, la fecha inicial alternativa, la respuesta vacía, el reintento, la reconexión y las actualizaciones por versión.
- Comandos y salida:

  | Comando | Salida |
  | --- | --- |
  | `npm run build` | `webpack 5.106.2 compiled successfully` para API y migraciones. Angular generó el *chunk* diferido `flight-search-component`. |
  | `npm run build -w frontend -- --configuration fake` | `Application bundle generation complete. [1.742 seconds]` |
  | `npm test -w frontend` | `Test Files  5 passed (5)` · `Tests  18 passed (18)` |
  | `npm run lint` | `eslint .`, código de salida `0`. |
  | Chrome con `npm start -w frontend -- --configuration fake` | Listado revisado a 1366 y 360 px. Ancho del documento de 360 px en móvil. Tab mostró un contorno de 3 px y Enter intercambió los aeropuertos conservando la fecha. |
  | Lighthouse móvil, modo `snapshot` | `Accessibility: 100` y cero comprobaciones de accesibilidad fallidas. |

- Capacidades reales verificadas: ninguna. `search` sigue en el adaptador falso hasta integrar M1 en `develop`. La verificación de Socket.IO real queda para M2.
- Desviaciones del contrato: ninguna detectada en los casos probados.
- Cambios que necesita la documentación: ninguno.

### F3 · 2026-11-19

- La búsqueda enlaza al mapa y a la ocupación. Ambas vistas comparten la suscripción y el inventario por vuelo. El mapa permite bloquear y liberar asientos, muestra el vencimiento calculado con el reloj del servidor y conserva el inventario durante una desconexión.
- Los identificadores de vuelos simulados se mantienen al recargar un enlace cuyo vuelo sigue en el catálogo. Los bloqueos de `fake` se recuperan al reconectar en la misma instancia de la aplicación.
- Los comandos y la revisión de navegador dieron estos resultados.

  | Comando | Salida |
  | --- | --- |
  | `npm run build` | `webpack 5.106.2 compiled successfully` para API y migraciones. Angular generó los *chunks* diferidos del mapa y la ocupación. |
  | `npm run build -w frontend -- --configuration fake` | `Application bundle generation complete. [2.284 seconds]` |
  | `npm test -w frontend` | `Test Files  6 passed (6)` · `Tests  23 passed (23)` |
  | `npm run lint` | `eslint .`, código de salida `0`. |
  | Chrome con `npm start -w frontend -- --configuration fake` | Mapa y ocupación revisados a 360 y 1366 px sin desbordamiento. Tab mostró foco de 3 px y Enter bloqueó 1A. Al pasar a ocupación se vieron 5 disponibles, 1 bloqueado y 0 reservados. |
  | Lighthouse, modo `snapshot` | `Accessibility: 100` en el mapa móvil y la ocupación de escritorio, sin comprobaciones de accesibilidad fallidas. |

- La validación de búsqueda con M1 y la de inventario y Socket.IO con M2 siguen pendientes de su integración en `develop`. El adaptador `fake` aporta pre-evidencia para F3.
- No se detectaron desviaciones del contrato en los casos probados.

### F4 · 2026-11-19

- El mapa abre la compra con un bloqueo vigente y conserva la suscripción y el reloj del servidor. La vista muestra las tarjetas de prueba, valida el formulario y limpia el campo de tarjeta después de cada envío.
- El reintento en la misma vista conserva la clave de idempotencia. Si el resultado es incierto, pide reintroducir una tarjeta con la misma terminación y permite recuperar el boleto aunque el asiento ya esté reservado.
- La confirmación y la consulta por código y apellido muestran el mismo componente de boleto.

  | Comando | Salida |
  | --- | --- |
  | `npm run build` | `webpack 5.106.2 compiled successfully` para API y migraciones. Angular generó los *chunks* de compra y consulta. |
  | `npm run build -w frontend -- --configuration fake` | `Application bundle generation complete. [3.570 seconds]` |
  | `npm test -w frontend` | `Test Files  7 passed (7)` · `Tests  29 passed (29)` |
  | `npm run lint` | `eslint .`, código de salida `0`. |
  | Chrome con `npm start -w frontend -- --configuration fake` | Flujo revisado a 360 y 1366 px. Enter confirmó la reserva tras corregir un pago rechazado. La consulta rechazó el apellido incorrecto y devolvió el mismo boleto con el apellido correcto. El foco llegó al título del boleto. |
  | Lighthouse, modo `snapshot` | `Accessibility: 100` en la compra a 360 px y en la consulta de escritorio, sin fallos de accesibilidad. |

- La validación de compra y consulta contra el backend sigue pendiente de la integración de M2 y M3 en `develop`. El adaptador `fake` aporta pre-evidencia para F4.
- No se detectaron desviaciones del contrato en los casos probados.

### F5 · 2026-11-19

- Administración se carga bajo demanda y conserva el token en memoria. El panel reutiliza el listado, permite retrasar y cancelar vuelos y aplica las respuestas y eventos por versión.
- La navegación pública incorpora «Estado de vuelos». A 360 px la barra inferior reserva espacio para los controles de cada vista.

  | Comando | Salida |
  | --- | --- |
  | `npm run build` | `webpack 5.106.2 compiled successfully` para API y migraciones. Angular generó los *chunks* diferidos de acceso y administración. |
  | `npm run build -w frontend -- --configuration fake` | `Application bundle generation complete. [3.068 seconds]` |
  | `npm test -w frontend` | `Test Files  8 passed (8)` · `Tests  34 passed (34)` |
  | `npm run lint` | `eslint .`, código de salida `0`. |
  | Chrome en modo `fake` | Navegación comprobada a 360 y 1366 px. Enter retrasó el vuelo y abrió el diálogo de cancelación. El diálogo enfocó «Volver», Escape devolvió el foco al botón y la confirmación lo llevó a la fila. El listado público mostró «Cancelado». También se verificaron el estado vacío y la validación del destino. |
  | Lighthouse, modo `snapshot` | `Accessibility: 100` sin fallos de accesibilidad en búsqueda, mapa, ocupación, compra, consulta de boleto, acceso, diálogo de cancelación y panel. |

- El `PATCH` real y la sincronización entre dos pestañas quedan pendientes de M4 y sus dependencias en `develop`. Los resultados con `fake` son pre-evidencia para F5.

### F2–F5 · Capacidades reales · 2026-11-19

- Commit validado en `develop`: `3f409a3`. Se retiró `fake` de `build` y `serve` de Angular. El proveedor simulado quedó configurado en `fake-transport.spec.ts`.
- `npm run build -w frontend` compiló correctamente, `npm test -w frontend` aprobó 34 pruebas en 8 archivos y `npm run lint` terminó con código 0.
- `docker compose -p aeropulse-f2-f5 up -d --build --wait --wait-timeout 120` levantó el stack local. PostgreSQL y la API quedaron saludables, se aplicaron 2 migraciones y `GET /api/health` devolvió `200` con `{"status":"ok"}`.

| Capacidad real | Evidencia en el navegador |
| --- | --- |
| `search` · M1 | `GET /api/flights` devolvió `200` para `BOG → MDE` el 19 de noviembre de 2026 UTC. La interfaz mostró `AP103` y `AP105` en el mismo orden que la respuesta. |
| `seats` · M2 | En `AP105`, `POST` al recurso de bloqueo de `1A` devolvió `201` y el mapa mostró «Mi asiento». `DELETE` devolvió `204` y el mapa volvió a mostrar «Disponible». |
| `realtime` · M2 | Nginx registró el cambio de protocolo `101` para `/ws/`. Una segunda sesión del mapa observó `AVAILABLE → HELD → AVAILABLE` para `1A`, sin recargar. |
| `booking` · M3 | El checkout confirmó `1A` en `AP105` con `POST /api/bookings/confirm` (`201`). La consulta por código y apellido devolvió `200` y mostró el mismo boleto. |
| `admin` · M4 | El panel marcó `AP103` como retrasado mediante `PATCH /api/admin/flights/:flightId/status` (`200`). El listado público de otra sesión pasó de «Programado» a «Retrasado» sin recargar. |
