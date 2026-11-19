# Registro de IA

## Registro

- **18 de noviembre de 2026.** El primer build del backend en Docker no encontraba `ts-loader`. Lo declaré en el workspace de NestJS y configuré webpack para resolver las dependencias externas instaladas por npm en la raíz. Verifiqué ambos ejecutables con `npm run build` y Docker Compose.
- **18 de noviembre de 2026.** Ajusté la referencia al esquema de Angular CLI para que apunte al `node_modules` raíz. También corregí las comprobaciones de los exports ESM y CommonJS para ejecutarlas por separado, y usé `localhost:4200` en la prueba del proxy local de Angular. Las comprobaciones pasaron.
