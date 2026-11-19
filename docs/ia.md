# Registro de IA

## Registro

- **18 de noviembre de 2026.** El primer build del backend en Docker no encontraba `ts-loader`. Lo declaré en el workspace de NestJS y configuré webpack para resolver las dependencias externas instaladas por npm en la raíz. Verifiqué ambos ejecutables con `npm run build` y Docker Compose.
- **18 de noviembre de 2026.** Ajusté la referencia al esquema de Angular CLI para que apunte al `node_modules` raíz. También corregí las comprobaciones de los exports ESM y CommonJS para ejecutarlas por separado, y usé `localhost:4200` en la prueba del proxy local de Angular. Las comprobaciones pasaron.
- **18 de noviembre de 2026.** La revisión inicial de concurrencia omitió el interbloqueo al intercambiar asientos con bloqueos vencidos. Revisé el orden de las escrituras y documenté cómo revertir y reintentar la transacción completa. La comprobación con PostgreSQL queda en M2, cuando se implemente el bloqueo.

## Registro por carril

Cada carril escribe solo en su subsección, **antes** de su marcador de cierre. Así las fusiones entre `lane/backend` y `lane/frontend` no chocan. El integrador las unifica al cerrar la entrega.

### Carril backend (Claude)

- **19 de noviembre de 2026.** En el *seed* usé `.returning(['seat_code'])` con nombres de columna; con un arreglo TypeORM 1.x espera nombres de propiedad, así que el conteo de asientos insertados salía en 0 aunque las filas sí se creaban. Lo cambié a `['seatCode']` y las pruebas del *seed* lo detectaron.
- **19 de noviembre de 2026.** Mi prueba del pipe de validación destructuraba `code` y `fields` del objeto raíz en vez de `error`, y falló 11 casos aunque la implementación era correcta. Corregí el *helper* para leer `ErrorResponse.error`.
- **19 de noviembre de 2026.** Planifiqué las pruebas HTTP con `@nestjs/testing`, que no está instalado y no se pueden agregar dependencias. Las reescribí con `NestFactory.create` y `fetch` nativo.
- **19 de noviembre de 2026.** Esperaba que un estado de asiento desconocido violara `seats_status_check`, pero PostgreSQL informa `seats_hold_check` (se evalúan ambos `CHECK`). La prueba ahora exige solo el código `23514` en ese caso.
- **19 de noviembre de 2026 (M2).** `npm run lint` encontró dos errores en mis pruebas nuevas: un `import type` sin usar en `hold.spec.ts` y una bandera booleana en `hold-deadlock.spec.ts` que ESLint marcó como asignación inútil. Quité el import y la bandera; la propia sentencia que cierra el ciclo prueba que PostgreSQL abortó el primer intento de la API, porque sin ese aborto no termina.
- **19 de noviembre de 2026 (M3).** En una prueba de idempotencia inventé un número de tarjeta terminado en `4242` (`4000056655664242`) que no cumple Luhn; la API respondió `400` correctamente y la prueba falló. Lo verifiqué con un cálculo aparte y usé uno válido (`4000056655694242`).
- **19 de noviembre de 2026 (M3).** Escribí una prueba de «bloqueo vencido aún `HELD` y después del barrido» que, en realidad, barría los dos asientos antes de confirmar, así que el nombre y un comentario no coincidían con lo que comprobaba. La reduje al caso «después del barrido»; el caso «aún `HELD`» ya lo cubre otra prueba.

<!-- fin carril backend -->

### Carril frontend (Codex)

_(sin entradas)_

<!-- fin carril frontend -->
