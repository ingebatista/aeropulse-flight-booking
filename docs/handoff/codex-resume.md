# Prompt para retomar la integración M5 (Codex)

Pega el bloque de abajo como primer mensaje en una sesión nueva de Codex, abierta en `B:\PROYECTOS\DAVIVIENDA\aeropulse-flight-booking` (rama `develop`). Estado al 2026-11-19.

````text
Eres el integrador del hito M5 del proyecto AeroPulse (kata de reservas de vuelos en tiempo real). Trabajas en B:\PROYECTOS\DAVIVIENDA\aeropulse-flight-booking, rama `develop`. Responde y comenta en español; los identificadores de código van en inglés.

LEE PRIMERO
1. AGENTS.md (reglas, invariantes de concurrencia, stack fijo; no actualices versiones).
2. docs/handoff/checklist.md: es la fuente de verdad. Solo el integrador marca casillas, con evidencia enlazada.
3. docs/handoff/evidence/README.md (evidencia de M5) y docs/ia.md.

ESTADO ACTUAL
- `develop` está en 9a06297, sin push (va 4 commits por delante de origin/develop). M0 a M4 y F1 a F5 están integrados.
- `npm run verify` pasa (exit 0): build, lint, format:check, 247 pruebas de backend (Testcontainers) y 34 de frontend. Está registrado en el checklist (8.2).
- Hay cambios SIN CONFIRMAR en el árbol de trabajo. No los reviertas ni los descartes:
  - docs/handoff/evidence/README.md, docs/handoff/checklist.md y docs/handoff/evidence/img/ (7 capturas): cierre de §6.C.5. Lo dejó la sesión anterior; falta confirmarlo.
  - README.md, docs/architecture.md, docs/ia.md y otros trozos de docs/handoff/checklist.md (8.3, 8.4, 8.6 y la «Trazabilidad M5»): los dejó otra sesión. Revísalos antes de confirmarlos.
- §6.C.5 está comprobada en el navegador (stack con HOLD_TTL_SECONDS=30) y marcada [x] en el árbol de trabajo. Los textos reales: «El asiento ya no está disponible.», «El pago fue rechazado.», «Venció el bloqueo del asiento 2A.», «Necesitas un bloqueo vigente para confirmar.», «El bloqueo del asiento ya no está vigente.», «Sin conexión» y «Conexión restablecida». El conflicto y el HOLD_INACTIVE se provocaron con una carrera y un retraso de 26 s inyectados desde la consola; está declarado en la evidencia.

LO QUE QUEDA (casillas abiertas en el checklist)
1. Confirmar los cambios pendientes en commits separados, con git add selectivo por archivo y sin mezclar el trabajo de dos sesiones: (a) §6.C.5 con las capturas; (b) 8.3, 8.4 y 8.6 y los cambios de docs de la otra sesión, tras revisarlos contra el código.
2. 8.5 `docs/ia.md`: faltan solo datos que solo el humano conoce. Pídeselos; no los inventes. Verifica qué dice ya la sección de herramientas y el tiempo ahorrado.
3. 8.7 Probar ejecución y demostración desde un clon limpio: `git clone` a un directorio nuevo, `docker compose up --build` SIN `.env`, GET /api/health, flujo de dos pestañas, demostración de AP105 (agotarlo en una pestaña y ver «Agotado» en otra sin recargar), y seguir el README paso a paso. Anota la evidencia y los desvíos.
4. 8.8 Hacer público el repositorio y comprobar acceso anónimo: lo hace el humano; tú solo prepara la comprobación.
5. 8.9 Preparar la demostración y la sustentación de 30 minutos, con decisiones y limitaciones (apoyándote en docs/architecture.md, la «Trazabilidad M5» y docs/handoff/evidence).

REGLAS
- No agregues dependencias ni cambies packages/shared sin visto bueno del humano.
- Commits en español, estilo `docs: …` / `chore: …`, uno por cambio coherente. No hagas push ni publiques nada sin que el humano lo pida.
- Cualquier afirmación en el checklist debe tener evidencia reproducible (comando y salida, test o captura). Si no la tienes, deja la casilla abierta y di por qué.
- Si un problema no cede en ~30 min, detente y explica el bloqueo.

ENTORNO Y TRAMPAS
- Hay contenedores de otras sesiones. NO los toques: `aeropulse-m5-readme-20261119` (puerto 8080) y `aeropulse-m5-dev-20261119-db-1` (puerto 5433). El stack `aeropulse-int` (puerto 8082, TTL 30 s) es de esta integración: puedes reutilizarlo o bajarlo con `docker compose -p aeropulse-int down -v`. Para el clon limpio usa otro nombre de proyecto y otro WEB_PORT (por ejemplo `WEB_PORT=8090`).
- Los tests de backend usan Testcontainers con puertos aleatorios y requieren Docker.
- El límite de confirmación es 10 por minuto, por ruta e IP; agotar AP105 usa 6. Espacia los pasos.
- Para probar dos clientes, abre las pestañas escribiendo la dirección; «Duplicar pestaña» copia sessionStorage y comparte el clientId.
- El seed solo genera vuelos hasta el último día del mes en UTC; AP105 sale a las 22:30 UTC. Es una limitación conocida (docs/handoff/business-rules.md).
- Worktrees antiguos en B:\PROYECTOS\DAVIVIENDA\worktrees (wave1/design, wave1/readme-ia vacíos; wave1/evidence ya integrado por squash): no los uses.

CRITERIO DE TERMINADO
Cada casilla restante marcada con evidencia enlazada o declarada como limitación; `npm run verify` en verde sobre el commit final; el humano informado de lo que le toca (8.8 y la demo).
````

## Artefactos guardados en esta sesión

| Artefacto | Ruta |
| --- | --- |
| Capturas de §6.C.5 (7) | [docs/handoff/evidence/img](evidence/img/) |
| Resultados de §6.C.5 con su tabla | [docs/handoff/evidence/README.md](evidence/README.md#6c5--mensajes-de-conflicto-vencimiento-y-pérdida-de-conexión) |
| Casilla 6.C.5 marcada | [docs/handoff/checklist.md](checklist.md) |
| Este prompt | `docs/handoff/codex-resume.md` |
