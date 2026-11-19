# Evidencia de ejecución · M5 (§6.C y §7)

Registro de las verificaciones de [la checklist](../checklist.md) hechas el 2026-11-19 contra el stack real (`docker compose`, PostgreSQL 17, API NestJS, Nginx y Angular), desde la rama `wave1/evidence`. **Sin capturas de imagen:** el desarrollo aún no termina, así que la evidencia son comandos, respuestas HTTP y el contenido de la página leído en el navegador.

Los límites eran los de producción de la kata (`confirm`: 10 por minuto, por ruta e IP). Sobre el bloque A (7.3) y el B (7.4) se hicieron 7 `confirm` en menos de un minuto y 2 más en el bloque C; no hubo ningún `429`. Los identificadores de cliente y los tokens no se publican.

## Preparación

```powershell
docker compose -p aeropulse-evidence up -d --build --wait --wait-timeout 300
```

Sin archivo `.env`: Compose usó sus valores por defecto (`HOLD_TTL_SECONDS=300`). Para probar el vencimiento (6.C.5) se reinició solo la API con `HOLD_TTL_SECONDS=30 docker compose -p aeropulse-evidence up -d --wait api`.

Los dos «clientes» de 6.C.1 son dos pestañas abiertas escribiendo la URL (no con «Duplicar pestaña», que copia `sessionStorage` y compartiría el `clientId`, [arch §5](../architecture.md#5-identidad-seguridad-y-límites)). Sus `clientId` empiezan por `2a131186` y `fc5605da`: son distintos.

## 7.2 · `docker compose up` sin `.env` y salud con la base

`db`, `migrate` (terminó con código 0), `api` y `web` quedaron `healthy`. Respuesta (a través de Nginx, puerto 8080):

```text
$ curl -i http://localhost:8080/api/health
HTTP/1.1 200 OK
X-RateLimit-Limit: 120
...
{"status":"ok"}
```

La API se conecta con el rol `app`; la ruta de salud consulta PostgreSQL.

## 7.3 · Flujo completo con el stack real

Vuelo `AP103` (`BOG → MDE`, 2026-11-19, 289.000 COP), asiento `3A`, a las 14:23:29 UTC.

| Paso | Resultado |
| --- | --- |
| Búsqueda `GET /api/flights?origin=BOG&destination=MDE&date=2026-11-19` | `200`, `AP103` y `AP105` |
| Bloqueo `POST …/seats/3A/hold` | `201`, `status: HELD` |
| Confirmación `POST /api/bookings/confirm` (tarjeta terminada en `4242`) | `201`, código `DKQMKY` |
| Consulta `GET /api/bookings/DKQMKY?lastName=Gómez` | `200`, mismo boleto: `AP103`, `3A`, 289.000 COP |

Esta parte se ejecutó por HTTP, no con la interfaz. La interfaz con el backend real (búsqueda, bloqueo, checkout y boleto) la verificó el carril frontend: [F2–F5](../handoff/frontend.md#f2f5--capacidades-reales--2026-11-19).

## 7.4 · Demostración de `AP105` (vuelo de seis asientos)

Una pestaña con el listado `/estado-de-vuelos` abierta y sin recargar. Antes: `AP105` «Programado». Se bloquearon y confirmaron `1A`, `1B`, `1C`, `2A`, `2B` y `2C` con seis clientes distintos (14:24:10 a 14:24:17 UTC): seis `201` en `hold` y seis `201` en `confirm` (códigos distintos).

- `GET /api/flights`: `AP105` con `"soldOut": true` y `"version": 2`.
- La pestaña del listado, sin recargar, pasó a mostrar `AP105 … Programado · Agotado`.

## 6.C.1 · Cambios de asiento en tiempo real entre dos pestañas

Dos pestañas independientes en el mapa de `AP103`. En la pestaña A se eligió `2B` (`HELD`, «Mi asiento»). En la pestaña B, sin recargar, `2B` pasó a «Bloqueado». Tests que lo respaldan: `backend/test/realtime/realtime-e2e.spec.ts` y `frontend/src/app/core/socket/flight-realtime.spec.ts`.

## 6.C.2 · Listado ante cambio de estado

Con la pestaña pública en `/estado-de-vuelos` y el panel `/admin` (token de desarrollo) en otra, se pulsó «Marcar retraso del vuelo AP103» (`PATCH` → `200`). La pestaña pública, sin recargar, pasó de «Programado» a «Retrasado»; el agotado de `AP105` (7.4) llegó por el mismo canal.

## 6.C.3 · Dashboard con los contadores

`/vuelos/{AP103}/ocupacion` con `2B` bloqueado mostró: **Disponibles 23 · Bloqueados 1 · Reservados 0**.

## 6.C.4 · Recuperación tras recargar y eventos duplicados o desordenados

Tras recargar la pestaña A, el mapa volvió a mostrar «Mi asiento · 2B» con «Tiempo restante 04:42» (`myHold` de la instantánea). Los casos de versiones, duplicados y desorden los cubren los tests existentes, ejecutados hoy:

```text
npm test -w frontend -- --include src/app/core/stores/inventory-store.spec.ts --include src/app/core/socket/flight-realtime.spec.ts
  Test Files  2 passed (2) · Tests  6 passed (6)

npm test -w backend -- test/realtime/realtime-e2e.spec.ts
  Test Suites: 1 passed, 1 total · Tests: 3 passed, 3 total
```

## 6.C.5 · Mensajes de conflicto, vencimiento y pérdida de conexión

Verificado contra la API (códigos de [catálogo de errores](../contracts-and-open-questions.md#catálogo-de-errores)):

| Caso | Resultado |
| --- | --- |
| Otro cliente bloquea un asiento ya bloqueado (`4A`) | `409 SEAT_UNAVAILABLE` · «El asiento no está disponible.» |
| Pago con tarjeta terminada en `0002` | `402 PAYMENT_DECLINED` · «El pago fue rechazado. Revisa la tarjeta.» |
| Confirmar tras vencer el bloqueo (`TTL=30`, 33 s después) | `409 HOLD_INACTIVE` · «No hay un bloqueo vigente para confirmar.» El registro de la API muestra el barrido y el rechazo con su código. |

Pérdida de conexión, en la interfaz: se detuvo el contenedor `api` (`docker compose -p aeropulse-evidence stop api`). La pestaña del listado mostró «Sin conexión» y «Se perdió la conexión. Puedes volver a intentar la búsqueda.». Al levantar `api` otra vez mostró «En vivo» y «Conexión restablecida».

**Pendiente:** el texto que la interfaz muestra para el conflicto, el pago rechazado y el vencimiento no se comprobó en el navegador en esta pasada, solo los códigos de la API.

## Limpieza

```powershell
docker compose -p aeropulse-evidence down -v
```
