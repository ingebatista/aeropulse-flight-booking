# Uso de inteligencia artificial

Este documento cubre los cuatro puntos que pide la kata: herramientas, prompts y casos de uso, refactorización y criterio propio, e impacto. Las correcciones se anotaron durante el trabajo, con fecha, para no reconstruirlas de memoria al final.

## 1. Herramientas utilizadas

| Herramienta | Modelo | Dónde se usó |
| --- | --- | --- |
| Claude Code (CLI y app de escritorio) | Claude Sonnet 5.5 en la mayoría de los commits y Claude Opus 5.5 en tres de ellos (según el pie `Co-Authored-By` de cada commit) | Diseño y contratos, carril backend (`backend/**`), integración en `develop`, evidencias y documentación |
| Codex (app de escritorio) | `gpt-6.2-astra`, `gpt-6.2-sol` y `gpt-6.1-terra`, según los metadatos de la sesión del carril. `gpt-6.2-sol` fue el más utilizado | Carril frontend (`frontend/**`), de F1 a F5 |
| Google Stitch (proyecto *AeroPulse Flight Search Web*, tipo *text-to-UI*) y su servidor MCP | El que asigna Stitch; la herramienta no lo expone | Mockups de escritorio y móvil de las ocho vistas, sistema visual de [DESIGN.md](../DESIGN.md) y consulta de los diseños desde los agentes durante la implementación del frontend. [Detalle](#diseño-de-interfaz-con-google-stitch) |
| Navegador integrado, Chrome y Lighthouse | No aplica | Revisión de la interfaz a 360 y 1366 px y auditoría de accesibilidad de F5 (resultados en [handoff/frontend.md](handoff/frontend.md)) |

Según las reglas del proyecto, el humano (integrador) revisa la evidencia de cada hito y lo fusiona en `develop`.

## 2. Prompts y casos de uso

El proyecto no se hizo con prompts sueltos. Se escribieron una vez las reglas y el alcance de cada agente, y cada tarea se pidió con un criterio de salida que se pudiera verificar. Los artefactos que cumplen el papel de prompt están en el repositorio:

| Caso de uso | Artefacto | Qué fija |
| --- | --- | --- |
| Reglas permanentes para cualquier agente | [AGENTS.md](../AGENTS.md) (que `CLAUDE.md` importa) | Estructura, stack fijo, las 8 invariantes de concurrencia, la tabla de sintaxis de TypeORM 1.x y los comandos de verificación |
| Diseño de arquitectura | [architecture.md](architecture.md), [persistence.md](handoff/persistence.md) y [contracts-and-open-questions.md](handoff/contracts-and-open-questions.md) | Las decisiones y sus descartes quedaron escritas antes de implementar |
| Generación de código por carril | [handoff/backend.md](handoff/backend.md) y [handoff/frontend.md](handoff/frontend.md) | Alcance por carpeta, lectura previa, hitos y una «definición de hecho» por hito |
| Pruebas | Cada hito del carril backend | Pruebas de concurrencia contra PostgreSQL real, sin simular la base de datos |
| Paralelización | [checklist.md](handoff/checklist.md), «Ejecución en paralelo» | Un `git worktree` por carril, `packages/shared` congelado y un solo dueño por archivo |

Fragmentos reales de esos briefs:

- _«`npm run build`, `npm test -w frontend` y `npm run lint` pasan en tu worktree, con la salida real pegada en el registro.»_ (definición de «hecho» del carril frontend).
- _«Las respuestas, los eventos y los códigos de error coinciden con los contratos. Si algo no encaja, no lo cambies en silencio: abre un `CCR`.»_ (carril backend).
- _«Nunca *check-then-act*. Bloquear, liberar, expirar y confirmar un asiento son una sola sentencia `UPDATE` condicional con `RETURNING`.»_ (invariante 1 de `AGENTS.md`).

### Diseño de interfaz con Google Stitch

La experiencia de usuario se diseñó antes de escribir el frontend, en tres pasos:

1. **Prompts de diseño.** Redacté un bloque base con el contexto, la paleta, la tipografía, la composición responsive y el vocabulario de estados, y un prompt por vista para las ocho pantallas del flujo: búsqueda, resultados, mapa de asientos, ocupación, confirmación, boleto, consulta y administración. Cada prompt usa los mismos datos de ejemplo (`AP103`, asiento `2A`) para que las vistas encajen entre sí. [Prompts de mockups](mockups-stitch-prompts.md)
2. **Generación en Stitch.** Con esos prompts, Google Stitch generó los mockups de escritorio y de móvil de cada vista en un [proyecto público](https://stitch.withgoogle.com/projects/9552478381435950379). Un prompt de unificación (09) alineó las ocho vistas con una sola cabecera, navegación y biblioteca de componentes, y uno de corrección (10) rehízo el contenedor de asientos. El sistema visual resultante quedó versionado en [DESIGN.md](../DESIGN.md).
3. **Implementación conectada por MCP.** Conecté el proyecto de Stitch a los agentes de código mediante su servidor MCP. Así, el agente podía consultar las pantallas, su HTML de referencia y el `DESIGN.md` del proyecto mientras implementaba los componentes Angular, en lugar de reconstruir el diseño desde capturas. La configuración del servidor (`.mcp.json`) es local y está fuera del repositorio porque contiene una clave de API (ver [§3](#integración-oleadas-0-y-1)).

### Registros

Los registros de cada carril incluyen las salidas de los comandos. También se abrieron dos solicitudes de cambio, ambas integradas en `33c81bf`. Se añadió `NOT_FOUND` a `packages/shared` y se declaró `socket.io-client` como dependencia de desarrollo del backend.

## 3. Refactorización y criterio propio

Casos en los que la IA produjo algo incorrecto o subóptimo y cómo se corrigió. Están agrupados por área y en orden cronológico.

### Diseño y entorno

- **18 de noviembre de 2026.** El primer build del backend en Docker no encontraba `ts-loader`. Lo declaré en el workspace de NestJS y configuré webpack para resolver las dependencias externas instaladas por npm en la raíz. Verifiqué ambos ejecutables con `npm run build` y Docker Compose.
- **18 de noviembre de 2026.** Ajusté la referencia al esquema de Angular CLI para que apunte al `node_modules` raíz. También corregí las comprobaciones de los exports ESM y CommonJS para ejecutarlas por separado, y usé `localhost:4200` en la prueba del proxy local de Angular. Las comprobaciones pasaron.
- **18 de noviembre de 2026.** La revisión inicial de concurrencia omitió el interbloqueo al intercambiar asientos con bloqueos vencidos. Revisé el orden de las escrituras y documenté cómo revertir y reintentar la transacción completa. La prueba determinista contra PostgreSQL llegó en M2 (`hold-deadlock.spec.ts`).

### Diseño de interfaz (Google Stitch)

- **Mapa de asientos decorativo.** Stitch dibujó la cabina de mando, el morro, las alas con rótulos de turbina y una banda horizontal extendida alrededor de los asientos. Era vistoso pero ocupaba espacio, desalineaba las columnas y no escalaba a 24 plazas. Lo corregí con el prompt 10: una cuadrícula compacta de 3 + pasillo + 3, con el número de fila en el pasillo, hasta tres filas visibles y desplazamiento vertical interno.
- **Vistas que no parecían una sola aplicación.** Cada prompt generó su propia variante de cabecera, navegación móvil y componentes. Lo corregí con el prompt 09, que fijó `DESIGN.md` como fuente de verdad y unificó las ocho vistas en sus dos tamaños.

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
- **19 de noviembre de 2026.** La simulación del envío comprobó la conexión con GitHub, pero el envío real del usuario activó la protección de secretos. Dejé `.mcp.json` como configuración local de desarrollo y lo retiré del commit que GitHub había rechazado.

### Documentación de entrega (Claude)

- **19 de noviembre de 2026.** Al alinear el README con el enunciado escribí el enlace a la sección 4.7 de la arquitectura como `#37-…`. La validación automática de enlaces y anclas lo detectó antes de cerrar la tarea y lo corregí a `#47-…`.
- **19 de noviembre de 2026.** Para los requisitos mínimos de `docker compose up --build`, Docker no estaba en ejecución y no pude medir el tamaño de las imágenes. En lugar de presentar cifras de CPU, memoria y disco como mediciones, las dejé como valores de referencia y lo indiqué en el README.
- **19 de noviembre de 2026.** La primera versión de la guía de sustentación tenía tres datos imprecisos que encontré al contrastarla con este documento y con `architecture.md`. Atribuía las 247 pruebas del backend a la concurrencia, cuando son el total de unitarias y de integración. Decía que no se guarda el CVV, cuando el formulario ni siquiera lo pide. Y proponía escalar con `LISTEN/NOTIFY` y repartiendo el barrido, cuando la evolución documentada (§10) usa Redis. Corregí los tres.
- **19 de noviembre de 2026.** El humano corrigió la guía de sustentación: la había redactado entera en primera persona, incluido el problema y las historias de usuario, que vienen del enunciado y no son decisiones propias. La reescribí en tercera persona para lo que plantea la kata y en primera solo para lo decidido, construido o corregido.
- **19 de noviembre de 2026.** Antes de documentar el uso de Google Stitch consulté el proyecto por su servidor MCP para confirmar el nombre, la visibilidad pública y las 16 pantallas (8 vistas en escritorio y móvil). La dirección que tenía a mano apuntaba a `stitch.google.com`, y la corregí al dominio de Stitch, `stitch.withgoogle.com`.

## 4. Impacto

**Dónde aportó más valor la IA**

- **Pruebas de concurrencia.** El backend reúne 247 pruebas unitarias y de integración. Las de concurrencia usan PostgreSQL real y reproducen 50 `hold` simultáneos sobre un asiento, 20 confirmaciones con la misma `Idempotency-Key` y la compra simultánea de los dos últimos asientos.
- **Trabajo en paralelo.** Backend y frontend avanzaron a la vez en worktrees distintos con el contrato compartido congelado.
- **Documentación contrastada.** El diseño, los contratos y la evidencia se mantuvieron enlazados y revisables.
- **Diseño de interfaz.** Stitch produjo los mockups de escritorio y móvil de las ocho vistas a partir de prompts, y el servidor MCP los puso al alcance de los agentes durante la implementación, sin pasar por capturas ni por una herramienta de diseño manual.

**Dónde exigió más revisión humana**

- Las invariantes de concurrencia: la primera revisión omitió el interbloqueo (ver arriba).
- La sintaxis de TypeORM 1.x, que los modelos tienden a confundir con la 0.3.
- Las pruebas que pasan por la razón equivocada, como la del bloqueo vencido y la de la tarjeta.

**Tiempo.** Entre el primer commit (`169e586`, 18 de noviembre de 2026 a las 19:53) y la verificación previa a esta revisión (`9a06297`, 19 de noviembre a las 10:12) transcurrieron unas 14 h 18 min en hora de Bogotá. Ese intervalo incluye pausas y trabajo en paralelo.

_Pendiente de confirmación del responsable del proyecto. Estimar las horas de trabajo equivalente sin IA y el esfuerzo humano efectivo invertido. La diferencia permite informar un ahorro aproximado._
