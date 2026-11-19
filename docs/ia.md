# Registro de IA

## Registro

- **18 de noviembre de 2026.** El primer build del backend en Docker no encontraba `ts-loader`. Lo declaré en el workspace de NestJS y configuré webpack para resolver las dependencias externas instaladas por npm en la raíz. Verifiqué ambos ejecutables con `npm run build` y Docker Compose.
- **18 de noviembre de 2026.** Ajusté la referencia al esquema de Angular CLI para que apunte al `node_modules` raíz. También corregí las comprobaciones de los exports ESM y CommonJS para ejecutarlas por separado, y usé `localhost:4200` en la prueba del proxy local de Angular. Las comprobaciones pasaron.

## Registro por carril

Cada carril escribe solo en su subsección, **antes** de su marcador de cierre. Así las fusiones entre `lane/backend` y `lane/frontend` no chocan. El integrador las unifica al cerrar la entrega.

### Carril backend (Claude)

_(sin entradas)_

<!-- fin carril backend -->

### Carril frontend (Codex)

_(sin entradas)_

<!-- fin carril frontend -->
