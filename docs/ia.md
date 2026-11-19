# Uso de inteligencia artificial

Este documento cubre los cuatro puntos que pide la kata: herramientas, prompts y casos de uso, refactorización y criterio propio, e impacto. Las correcciones se anotaron durante el trabajo, con fecha, para no reconstruirlas de memoria al final.

## 1. Herramientas utilizadas

| Herramienta | Modelo | Dónde se usó |
| --- | --- | --- |
| Claude Code (CLI y app de escritorio) | Claude Sonnet 5.5 en la mayoría de los commits y Claude Opus 5.5 en tres de ellos (según el pie `Co-Authored-By` de cada commit) | Diseño y contratos, carril backend (`backend/**`), integración en `develop`, evidencias y documentación |
| Codex (app de escritorio) | _Pendiente (humano): anotar el modelo exacto que usó el carril frontend._ | Carril frontend (`frontend/**`), de F1 a F5 |
| Navegador integrado, Chrome y Lighthouse | No aplica | Revisión de la interfaz a 360 y 1366 px y auditoría de accesibilidad de F5 (resultados en [handoff/frontend.md](handoff/frontend.md)) |

Según las reglas del proyecto, el humano (integrador) revisa la evidencia de cada hito y lo fusiona en `develop`.

## 2. Prompts y casos de uso

El proyecto no se hizo con prompts sueltos. Se escribieron una vez las reglas y el alcance de cada agente, y cada tarea se pidió con un criterio de salida que se pudiera verificar. Los artefactos que cumplen el papel de prompt están en el repositorio:

| Caso de uso | Artefacto | Qué fija |
| --- | --- | --- |
| Reglas permanentes para cualquier agente | [AGENTS.md](../AGENTS.md) (que `CLAUDE.md` importa) | Estructura, stack fijo, las 8 invariantes de concurrencia, la tabla de sintaxis de TypeORM 1.x y los comandos de verificación |
| Diseño de arquitectura | [architecture.md](architecture.md), [persistence.md](persistence.md) y [contracts-and-open-questions.md](contracts-and-open-questions.md) | Las decisiones y sus descartes quedaron escritas antes de implementar |
| Generación de código por carril | [handoff/backend.md](handoff/backend.md) y [handoff/frontend.md](handoff/frontend.md) | Alcance por carpeta, lectura previa, hitos y una «definición de hecho» por hito |
| Pruebas | Cada hito del carril backend | Pruebas de concurrencia contra PostgreSQL real, sin simular la base de datos |
| Paralelización | [checklist.md](checklist.md), «Ejecución en paralelo» | Un `git worktree` por carril, `packages/shared` congelado y un solo dueño por archivo |

Fragmentos reales de esos briefs:

- _«`npm run build`, `npm test` y `npm run lint` pasan en tu worktree, con la salida real pegada en el registro.»_ (definición de «hecho» de ambos carriles).
- _«Las respuestas, los eventos y los códigos de error coinciden con los contratos. Si algo no encaja, no lo cambies en silencio: abre un `CCR`.»_ (carril backend).
- _«Nunca *check-then-act*. Bloquear, liberar, expirar y confirmar un asiento son una sola sentencia `UPDATE` condicional con `RETURNING`.»_ (invariante 1 de `AGENTS.md`).

Ese esquema dio dos efectos medibles: los agentes devolvían salida real de comandos en vez de afirmaciones, y los desacuerdos con el contrato salían como `CCR` en lugar de cambios silenciosos. Se abrieron dos, ambos aprobados e integrados en `33c81bf`: `NOT_FOUND` en `packages/shared` y `socket.io-client` como dependencia de desarrollo del backend.

## 3. Refactorización y criterio propio

Casos en los que la IA produjo algo incorrecto o subóptimo y cómo se corrigió. Están agrupados por área y en orden cronológico.

### Diseño y entorno

- **18 de noviembre de 2026.** El primer build del backend en Docker no encontraba `ts-loader`. Lo declaré en el workspace de NestJS y configuré webpack para resolver las dependencias externas instaladas por npm en la raíz. Verifiqué ambos ejecutables con `npm run build` y Docker Compose.
- **18 de noviembre de 2026.** Ajusté la referencia al esquema de Angular CLI para que apunte al `node_modules` raíz. También corregí las comprobaciones de los exports ESM y CommonJS para ejecutarlas por separado, y usé `localhost:4200` en la prueba del proxy local de Angular. Las comprobaciones pasaron.
- **18 de noviembre de 2026.** La revisión inicial de concurrencia omitió el interbloqueo al intercambiar asientos con bloqueos vencidos. Revisé el orden de las escrituras y documenté cómo revertir y reintentar la transacción completa. La prueba determinista contra PostgreSQL llegó en M2 (`hold-deadlock.spec.ts`).

### Carril backend (Claude)

- **19 de noviembre de 2026.** En el *seed* usé `.returning(['seat_code'])` con nombres de columna; con un arreglo TypeORM 1.x espera nombres de propiedad, así que el conteo de asientos insertados salía en 0 aunque las filas sí se creaban. Lo cambié a `['seatCode']` y las pruebas del *seed* lo detectaron.
- **19 de noviembre de 2026.** Mi prueba del pipe de validación destructuraba `code` y `fields` del objeto raíz en vez de `error`, y falló 11 casos aunque la implementación era correcta. Corregí el *helper* para leer `ErrorResponse.error`.
- **19 de noviembre de 2026.** Planifiqué las pruebas HTTP con `@nestjs/testing`, que no está instalado y no se pueden agregar dependencias. Las reescribí con `NestFactory.create` y `fetch` nativo.
- **19 de noviembre de 2026.** Esperaba que un estado de asiento desconocido violara `seats_status_check`, pero PostgreSQL informa `seats_hold_check` (se evalúan ambos `CHECK`). La prueba ahora exige solo el código `23514` en ese caso.
- **19 de noviembre de 2026 (M2).** `npm run lint` encontró dos errores en mis pruebas nuevas: un `import type` sin usar en `hold.spec.ts` y una bandera booleana en `hold-deadlock.spec.ts` que ESLint marcó como asignación inútil. Quité el import y la bandera; la propia sentencia que cierra el ciclo prueba que PostgreSQL abortó el primer intento de la API, porque sin ese aborto no termina.
- **19 de noviembre de 2026 (M3).** En una prueba de idempotencia inventé un número de tarjeta terminado en `4242` (`4000056655664242`) que no cumple Luhn; la API respondió `400` correctamente y la prueba falló. Lo verifiqué con un cálculo aparte y usé uno válido (`4000056655694242`).
- **19 de noviembre de 2026 (M3).** Escribí una prueba de «bloqueo vencido aún `HELD` y después del barrido» que, en realidad, barría los dos asientos antes de confirmar, así que el nombre y un comentario no coincidían con lo que comprobaba. La reduje al caso «después del barrido»; el caso «aún `HELD`» ya lo cubre otra prueba.
- **19 de noviembre de 2026 (M4).** Para silenciar el *logger* en la prueba de arranque en producción escribí `false as never`, un *cast* que ocultaba que el tipo del *helper* no admitía `false`. Corregí el tipo de `startApi` (`LoggerService | LogLevel[] | false`) y quité el *cast*.

### Carril frontend (Codex)

- **19 de noviembre de 2026.** La prueba del vencimiento usaba `vi.waitFor`, que adelantaba el reloj simulado y cambiaba el `serverNow` esperado. La ajusté para procesar el reconocimiento del socket sin avanzar el tiempo.
- **19 de noviembre de 2026.** Axe detectó una diferencia entre el nombre accesible y las abreviaturas visibles de los botones de fecha. Usé el texto visible como nombre y la fecha completa en UTC como descripción.
- **19 de noviembre de 2026.** La primera versión del aviso de F3 dependía del último tick de la cuenta regresiva. Añadí el caso en que el barrido del servidor llega antes y una prueba para distinguirlo de la liberación voluntaria.
- **19 de noviembre de 2026.** El compilador de Angular rechazó el acceso a los datos de un intento de compra que podía faltar. Cambié la plantilla para elegir el origen de los datos mediante una condición explícita.
- **19 de noviembre de 2026.** La prueba de «Estado de vuelos» comparaba espacios del HTML que no se ven en pantalla. Ajusté la comprobación para verificar el título visible.

### Integración (oleadas 0 y 1)

- **19 de noviembre de 2026.** El agente de evidencias de la oleada 1 marcó casillas de la checklist, que solo marca el integrador, y dejó el trabajo de diseño (arch §4.4 y §5, contrato) en la rama de evidencias. Separé los dos squash en commits distintos y revisé cada casilla contra su evidencia.
- **19 de noviembre de 2026.** Esa evidencia citaba el hash de un commit que el *squash* hace desaparecer de `develop`. Lo sustituí por el del commit integrado.
- **19 de noviembre de 2026.** El plan de la oleada 1 incluía añadir al catálogo una tabla de horarios que ya existía en `business-rules.md`. La revisión contra el código evitó duplicarla.

## 4. Impacto

**Dónde aportó más valor la IA**

- **Pruebas de concurrencia.** El backend lleva 247 pruebas contra PostgreSQL real, entre ellas 50 `hold` simultáneos sobre un asiento, 20 confirmaciones con la misma `Idempotency-Key` y dos confirmaciones de los dos últimos asientos.- **Trabajo en paralelo.** Con las reglas de aislamiento, backend y frontend avanzaron a la vez en worktrees distintos sin conflictos en `packages/shared`.
- **Documentación contrastada.** El diseño, los contratos y la evidencia se mantuvieron enlazados y revisables.

**Dónde exigió más revisión humana**

- Las invariantes de concurrencia: la primera revisión omitió el interbloqueo (ver arriba).
- La sintaxis de TypeORM 1.x, que los modelos tienden a confundir con la 0.3.
- Las pruebas que pasan por la razón equivocada, como la del bloqueo vencido y la de la tarjeta.

**Tiempo.** Los commits van del 18 de noviembre de 2026 (19:53) al 19 de noviembre de 2026 (09:40), es decir, unas 14 horas de calendario entre el primer y el último commit, sin contar las pausas.

_Pendiente (humano): estimar el tiempo ahorrado frente a hacerlo sin IA y anotarlo aquí. Solo la persona que hizo el trabajo puede dar esa cifra, y no se inventó una._
