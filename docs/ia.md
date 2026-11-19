# Registro de IA

## Registro

- **18 de noviembre de 2026.** El primer build del backend en Docker no encontraba `ts-loader`. Lo declaré en el workspace de NestJS y configuré webpack para resolver las dependencias externas instaladas por npm en la raíz. Verifiqué ambos ejecutables con `npm run build` y Docker Compose.
- **18 de noviembre de 2026.** Ajusté la referencia al esquema de Angular CLI para que apunte al `node_modules` raíz. También corregí las comprobaciones de los exports ESM y CommonJS para ejecutarlas por separado, y usé `localhost:4200` en la prueba del proxy local de Angular. Las comprobaciones pasaron.
- **18 de noviembre de 2026.** La revisión inicial de concurrencia omitió el interbloqueo al intercambiar asientos con bloqueos vencidos. Revisé el orden de las escrituras y documenté cómo revertir y reintentar la transacción completa. La comprobación con PostgreSQL queda en M2, cuando se implemente el bloqueo.

## Registro por carril

Cada carril escribe solo en su subsección, **antes** de su marcador de cierre. Así las fusiones entre `lane/backend` y `lane/frontend` no chocan. El integrador las unifica al cerrar la entrega.

### Carril backend (Claude)

_(sin entradas)_

<!-- fin carril backend -->

### Carril frontend (Codex)

- **19 de noviembre de 2026.** La prueba del vencimiento usaba `vi.waitFor`, que adelantaba el reloj simulado y cambiaba el `serverNow` esperado. La ajusté para procesar el reconocimiento del socket sin avanzar el tiempo.
- **19 de noviembre de 2026.** Axe detectó una diferencia entre el nombre accesible y las abreviaturas visibles de los botones de fecha. Usé el texto visible como nombre y la fecha completa en UTC como descripción.
- **19 de noviembre de 2026.** La primera versión del aviso de F3 dependía del último tick de la cuenta regresiva. Añadí el caso en que el barrido del servidor llega antes y una prueba para distinguirlo de la liberación voluntaria.
- **19 de noviembre de 2026.** El compilador de Angular rechazó el acceso a los datos de un intento de compra que podía faltar. Cambié la plantilla para elegir el origen de los datos mediante una condición explícita.
- **19 de noviembre de 2026.** La prueba de «Estado de vuelos» comparaba espacios del HTML que no se ven en pantalla. Ajusté la comprobación para verificar el título visible.

<!-- fin carril frontend -->
