# Contratos entre frontend y backend

**Estado: diseño cerrado para la kata.** Aquí se definen las rutas, los formatos y el comportamiento observable. La implementación y sus pruebas se siguen en la checklist. El diseño técnico y las reglas del catálogo se describen en [architecture.md](../architecture.md) y [business-rules.md](business-rules.md).

## Convenciones y validaciones

Las rutas usan el prefijo `/api`. Los cuerpos de solicitud y respuesta son JSON con nombres en `camelCase`. Las rutas que esperan un cuerpo requieren `Content-Type: application/json`. Las rutas sin cuerpo se invocan sin enviar uno. Los campos indicados como obligatorios rechazan valores ausentes, nulos o de otro tipo. Se rechazan propiedades, parámetros de consulta desconocidos y parámetros o encabezados de contrato repetidos. Los encabezados HTTP se tratan sin distinción de mayúsculas.

| Entrada | Validación |
| --- | --- |
| `flightId`, `X-Client-Id`, `holdToken`, `X-Hold-Token`, `Idempotency-Key` | UUID v4 en formato con guiones. Se aceptan ambas cajas y se normalizan a minúsculas antes de comparar. |
| `origin`, `destination` | Códigos en mayúsculas `BAQ`, `BOG`, `MDE`. Deben ser distintos. |
| `date` | Fecha real en formato `YYYY-MM-DD`. Se consulta el día UTC completo, desde su inicio inclusive hasta el inicio del día siguiente exclusivo. |
| `seatCode` | Cadena con formato `^[0-9]{1,2}[A-D]$`. La existencia del asiento se comprueba dentro del vuelo. |
| `code` | Seis caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Se admite minúscula y se consulta en mayúscula. |
| `passenger.firstName`, `passenger.lastName`, `lastName` | Cadenas de 1 a 60 caracteres después de normalizar a Unicode NFC y quitar espacios de los extremos. Admiten nombres compuestos, tildes y apóstrofos. Se rechazan caracteres de control y saltos de línea. |
| `payment.cardNumber` | Cadena de 13 a 19 dígitos ASCII, sin separadores, válida según Luhn. Es el único campo de `payment`. |
| `status` en administración | Uno de `DELAYED` o `CANCELLED`. El catálogo inicial asigna `SCHEDULED`. |

`X-Client-Id` identifica a la pestaña en las operaciones de inventario y confirmación. El cliente reutiliza el mismo UUID al recargar la pestaña y en `auth.clientId` de Socket.IO. El token del bloqueo y el identificador deben coincidir para confirmar o liberar. Las fechas de respuesta son instantes ISO 8601 en UTC con `Z`, los importes son enteros en COP y `version` es un entero positivo por recurso.

## Rutas HTTP

| Operación | Ruta y entrada | Éxito | Errores propios |
| --- | --- | --- | --- |
| Buscar vuelos | `GET /api/flights?origin=BOG&destination=MDE&date=2026-11-18`. Los tres parámetros son obligatorios. | `200` con `{ flights: Flight[] }`, ordenados por salida y luego por identificador. Devuelve `{ "flights": [] }` si no hay resultados. Incluye cancelados y agotados del día consultado. | Errores comunes. |
| Bloquear asiento | `POST /api/flights/{flightId}/seats/{seatCode}/hold` con `X-Client-Id`, sin cuerpo. | `201` al adquirirlo, `200` si ya pertenece al mismo cliente y sigue vigente. Ambos devuelven `{ seat: SeatEvent, hold: OwnHold, serverNow }`. | `404 FLIGHT_NOT_FOUND`, `404 SEAT_NOT_FOUND`, `409 FLIGHT_CANCELLED`, `409 SEAT_UNAVAILABLE`. |
| Liberar asiento | `DELETE /api/flights/{flightId}/seats/{seatCode}/hold` con `X-Client-Id` y `X-Hold-Token`, sin cuerpo. | `204` sin cuerpo. Véanse las reglas de liberación. | `404 FLIGHT_NOT_FOUND`, `404 SEAT_NOT_FOUND`, `409 HOLD_NOT_OWNED`. |
| Confirmar reserva | `POST /api/bookings/confirm` con `X-Client-Id`, `Idempotency-Key` y el cuerpo indicado abajo. | `201` con `Ticket` al crearla, `200` con el mismo boleto al repetir una confirmación exitosa. | `404 FLIGHT_NOT_FOUND`, `404 SEAT_NOT_FOUND`, `402 PAYMENT_DECLINED`, `409 FLIGHT_CANCELLED`, `409 HOLD_INACTIVE`, `422 IDEMPOTENCY_KEY_REUSED`. |
| Consultar boleto | `GET /api/bookings/{code}?lastName=G%C3%B3mez`. Se exige `lastName` y se compara sin distinguir mayúsculas, conservando los acentos. | `200` con el mismo formato `Ticket`. | `404 BOOKING_NOT_FOUND` tanto para código inexistente como para apellido incorrecto. |
| Cambiar estado del vuelo | `PATCH /api/admin/flights/{flightId}/status` con `Authorization: Bearer <ADMIN_TOKEN>` y cuerpo `{ "status": "DELAYED" }` o `{ "status": "CANCELLED" }`. | `200` con `FlightStatusEvent`. Repetir el mismo estado devuelve la versión actual sin emitir evento. | `401 UNAUTHORIZED`, `404 FLIGHT_NOT_FOUND`, `409 INVALID_FLIGHT_TRANSITION`. |

El mapa se carga con la instantánea de Socket.IO. Seleccionar un asiento solicita su bloqueo mediante HTTP. El dashboard usa esa misma instantánea y los eventos del vuelo.

### Respuestas y cuerpo de confirmación

La tabla fija la forma de cada objeto. Los objetos de respuesta se devuelven con todos los campos listados.

| Objeto | Campos |
| --- | --- |
| `Flight` | `id` (UUID), `flightNumber`, `origin`, `destination`, `departureAt`, `arrivalAt`, `fareCop`, `status`, `soldOut` (booleano), `version`. |
| `SeatEvent` | `flightId` (UUID), `seatCode`, `status` (`AVAILABLE`, `HELD` o `BOOKED`), `version`. |
| `OwnHold` | `seatCode`, `holdToken` (UUID), `holdExpiresAt`, `version` del asiento al obtener el bloqueo. |
| `FlightStatusEvent` | `flightId` (UUID), `status` (`SCHEDULED`, `DELAYED` o `CANCELLED`), `soldOut` (booleano), `version`. |
| `Ticket` | `code`, `flight` con `id`, `flightNumber`, `origin`, `destination`, `departureAt` y `arrivalAt`, `seatCode`, `passenger` con `firstName` y `lastName`, `amountCop`, `createdAt`. |

Ejemplo de cuerpo para confirmar, con una tarjeta ficticia y todos los campos obligatorios.

```json
{
  "flightId": "d92a8037-1598-4b45-985f-84158129142f",
  "seatCode": "2A",
  "holdToken": "53d65dc2-9904-43fb-9699-60c553a9d774",
  "passenger": { "firstName": "Laura", "lastName": "Gómez" },
  "payment": { "cardNumber": "4242424242424242" }
}
```

### Bloqueo, liberación y vencimiento

- La vigencia se decide con el reloj de PostgreSQL. `now()` representa el inicio de la transacción de la operación. Un bloqueo está vigente mientras `holdExpiresAt > now()` y vencido desde `holdExpiresAt <= now()`.
- Al pedir un bloqueo nuevo, el asiento puede estar disponible o tener un bloqueo vencido. Si el cliente cambia de asiento, su bloqueo anterior se libera únicamente si obtiene el nuevo. Reintentar el mismo bloqueo vigente devuelve el token, vencimiento y versión originales.
- La liberación explícita cambia a `AVAILABLE` únicamente un bloqueo vigente que coincida en asiento, cliente y token. Se permite aunque el vuelo esté cancelado.
- Si la escritura condicional no libera ninguna fila, se consulta el estado actual para elegir la respuesta. Cuando queda un bloqueo vigente con otro token o cliente, se devuelve `409 HOLD_NOT_OWNED`. Si el asiento existe y ya no tiene un bloqueo vigente, se devuelve `204`. Ninguno de estos casos cambia el asiento ni emite eventos. El vencido queda disponible para el barrido o para la siguiente adquisición.
- Un cambio real de estado emite `seat.changed` después del commit. Reemplazar un bloqueo vencido directamente emite solo `HELD` con una versión nueva, aunque el estado anterior también fuera `HELD`. El frontend puede descartar así la titularidad anterior. Un cambio exitoso de asiento emite un evento por cada asiento modificado.
- Entre liberación, confirmación, expiración y nueva adquisición decide la escritura condicional. Una solicitud de liberación retrasada nunca afecta un bloqueo nuevo.

### Confirmación y administración

- La clave de idempotencia se genera una vez por intento de compra. Tras validar el formato, se comprueba si la clave ya produjo un boleto. La igualdad usa vuelo, asiento, cliente, token, nombres normalizados y últimos cuatro dígitos. Dos números válidos con la misma terminación son equivalentes a efectos de la huella. Una clave con la misma huella obtiene `200` aunque el bloqueo ya no exista. Una huella distinta obtiene `422 IDEMPOTENCY_KEY_REUSED`.
- Para un intento nuevo se comprueba primero la existencia del vuelo y asiento, luego el estado del vuelo y la vigencia y titularidad del bloqueo. La compra aprobada vuelve a exigir esas condiciones en la transacción. Ante un conflicto de estado o de unicidad de la clave, se revierte cualquier escritura de ese intento y se vuelve a consultar la clave fuera de la transacción. Si otro intento generó el boleto, se aplica la misma comparación de huellas. Sin boleto previo, un bloqueo vencido, retirado, ajeno o sustituido devuelve `409 HOLD_INACTIVE`.
- El simulador aprueba una tarjeta válida terminada en `4242` y rechaza las demás, incluida la tarjeta de prueba terminada en `0002`. Tras un rechazo se puede corregir el pago dentro del plazo. Una clave solo queda consumida al confirmarse la reserva. La respuesta del boleto y los eventos omiten datos de pago.
- Administración puede pasar de `SCHEDULED` a `DELAYED` o `CANCELLED`, y de `DELAYED` a `CANCELLED`. `CANCELLED` es terminal. `soldOut` solo cambia al confirmar el último asiento.

## Catálogo de errores

HTTP devuelve el estado correspondiente y un objeto `{ "error": { "code": "...", "message": "..." } }`. El frontend toma decisiones por `code`. `VALIDATION_ERROR` agrega `fields` con entradas `{ field, reason }`. `reason` es uno de `REQUIRED`, `INVALID`, `UNEXPECTED` o `DUPLICATE`. Los campos se identifican por nombre con un prefijo según su origen: `query.*`, `param.*`, `body.*` y `header.<nombre>`. Los encabezados se nombran en minúscula, por ejemplo `header.x-client-id` o `header.x-hold-token`. Ejemplos: `query.date` o `body.passenger.lastName`. El error nunca repite el valor recibido.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los datos enviados.",
    "fields": [{ "field": "query.date", "reason": "INVALID" }]
  }
}
```

| HTTP | Código | Cuándo aplica |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Entrada que incumple las reglas de formato o JSON mal formado. Para JSON mal formado se indica `body` con `INVALID`. |
| 401 | `UNAUTHORIZED` | Token de administración ausente o inválido. Se responde con `WWW-Authenticate: Bearer`. |
| 402 | `PAYMENT_DECLINED` | El simulador rechaza la tarjeta válida. |
| 404 | `FLIGHT_NOT_FOUND` | El identificador del vuelo no existe. |
| 404 | `SEAT_NOT_FOUND` | El vuelo existe, pero el código no corresponde a uno de sus asientos. |
| 404 | `BOOKING_NOT_FOUND` | El código y el apellido no identifican un boleto. |
| 404 | `NOT_FOUND` | La ruta no existe. |
| 409 | `FLIGHT_CANCELLED` | Se intenta bloquear o confirmar un asiento en un vuelo cancelado. |
| 409 | `SEAT_UNAVAILABLE` | El asiento está reservado o tiene un bloqueo vigente de otro cliente. |
| 409 | `HOLD_INACTIVE` | No hay un bloqueo vigente que coincida en asiento, cliente y token al confirmar. El frontend descarta el bloqueo local si coincide con el token que envió y pide seleccionar un asiento de nuevo si no hay otro bloqueo vigente. |
| 409 | `HOLD_NOT_OWNED` | Al liberar, el asiento tiene un bloqueo vigente que no coincide con el cliente o el token. |
| 409 | `INVALID_FLIGHT_TRANSITION` | Se intenta cambiar un vuelo cancelado a retrasado. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Una ruta que recibe un cuerpo JSON se invoca con cuerpo en otro formato. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | La clave ya produjo un boleto para datos distintos. |
| 429 | `RATE_LIMITED` | Se excede el límite de solicitudes. El servidor indica la espera en segundos mediante `Retry-After`. |
| 500 | `INTERNAL_ERROR` | Error inesperado. El mensaje público es genérico. |

Los errores comunes aplicables a las rutas son `VALIDATION_ERROR`, `UNSUPPORTED_MEDIA_TYPE` en rutas con cuerpo, `RATE_LIMITED` e `INTERNAL_ERROR`. Los mensajes y registros no exponen identificadores de cliente, tokens de bloqueo, tarjetas ni cuerpos del pago.

## Socket.IO

- La conexión usa la ruta `/ws`. `auth.clientId` se valida como UUID v4 cuando se envía. Se admite una conexión sin ese campo para lectura pública. Ante un identificador mal formado, `connect_error` contiene `data.code = 'VALIDATION_ERROR'`.
- El cliente emite `join(room, ack)` al conectar o reconectar. La búsqueda usa `search`. El mapa, el checkout y el dashboard usan `flight:{flightId}` y `search`. Al cambiar el conjunto de salas, el cliente abre una nueva conexión con el mismo `clientId` y descarta los *acks* de la anterior. El servidor ingresa a la sala antes de consultar sus datos.
- `join('search')` responde con `{ ok: true, data: { serverNow } }`. El cliente hace la búsqueda HTTP tras ese reconocimiento.
- La sala de vuelo responde con `{ ok: true, data: { flight, seats, myHold, serverNow } }`, leído en una sola transacción de solo lectura con `REPEATABLE READ`. `flight` es `Flight`, `seats` es `SeatEvent[]` y `myHold` es `OwnHold` o `null` si el cliente no tiene un bloqueo vigente o es espectador. `serverNow` se obtiene del reloj de PostgreSQL tanto en instantáneas como al adquirir un bloqueo.
- Un fallo de `join` responde con `{ ok: false, error: { code, message } }`. Usa `VALIDATION_ERROR` para una sala inválida, `FLIGHT_NOT_FOUND` si el vuelo no existe e `INTERNAL_ERROR` ante un fallo inesperado. El servidor no conserva una suscripción creada por un `join` fallido.

| Evento | Sala | Datos | Cuándo se emite |
| --- | --- | --- | --- |
| `seat.changed` | `flight:{flightId}` | `SeatEvent` | Tras el commit de un bloqueo, sustitución, liberación, expiración o confirmación. |
| `flight.status_changed` | `search` | `FlightStatusEvent` | Tras el commit de un cambio operativo o al agotarse el vuelo. |

El frontend compara versiones por asiento y por vuelo para fusionar instantáneas, respuestas y eventos. `FlightStatusEvent` actualiza solo el estado operativo y `soldOut`. Una respuesta con `Flight` puede completar los datos de catálogo ausentes aunque su versión sea anterior a la del estado conocido. Los eventos públicos nunca contienen `clientId`, `holdToken` ni datos del pasajero. La vista aplica `myHold` o `hold` solo si coincide con la versión vigente del asiento y su estado es `HELD`. Si un evento avanza esa versión, el bloqueo local anterior se descarta. `myHold: null` descarta el bloqueo local cuando la versión del asiento en la instantánea es igual o posterior a la del bloqueo local.

## Casos de aceptación para la implementación

- Buscar para una fecha inválida devuelve `400 VALIDATION_ERROR`. Una búsqueda válida sin coincidencias devuelve `200` con `{ "flights": [] }`.
- Dos clientes intentan bloquear en paralelo el mismo asiento disponible de un vuelo programado. Uno obtiene `201` y el otro `409 SEAT_UNAVAILABLE`. Se guarda un bloqueo y se emite un `seat.changed` con `HELD`. Repetir el bloqueo vigente como titular devuelve `200` con el mismo token, vencimiento y versión, sin emitir otro evento.
- Un cliente intenta bloquear en paralelo dos asientos disponibles del mismo vuelo. Termina con un solo asiento `HELD` a su nombre. Si después intenta cambiar a un asiento con un bloqueo vigente de otro cliente, recibe `409 SEAT_UNAVAILABLE` y conserva su bloqueo previo.
- Liberar dos veces el mismo bloqueo con su cliente y token devuelve `204` ambas veces, con un solo `seat.changed` a `AVAILABLE`. Si otro cliente ya obtuvo el asiento, repetir la liberación anterior devuelve `409 HOLD_NOT_OWNED` y conserva el bloqueo nuevo.
- Con una clave de compra sin usar y un vuelo programado, confirmar con un bloqueo cuyo vencimiento es igual o anterior a `now()` devuelve `409 HOLD_INACTIVE`, tanto con la fila aún `HELD` como después del barrido. Si el barrido libera el asiento, se emite un solo `seat.changed` a `AVAILABLE`. Si un cliente adquiere directamente ese asiento vencido antes del barrido, se emite solo `seat.changed` con `HELD` y una versión mayor. El barrido conserva el bloqueo nuevo mientras siga vigente.
- Dos confirmaciones válidas en paralelo con la misma clave y huella, sobre el mismo bloqueo vigente y con pago aprobado, devuelven un `201` y un `200` con el mismo boleto. Se guarda una sola reserva y se emite un solo `seat.changed` a `BOOKED`. El reintento posterior devuelve el mismo boleto aunque el bloqueo ya se haya limpiado.
- Reusar una clave confirmada con una huella distinta devuelve `422 IDEMPOTENCY_KEY_REUSED`. Dos confirmaciones elegibles en paralelo sobre asientos distintos, con bloqueos vigentes, pagos aprobados y la misma clave, devuelven un `201` y un `422`. El intento perdedor conserva su asiento `HELD` y su versión, y no publica eventos. Un `402 PAYMENT_DECLINED` deja la clave libre para corregir el pago dentro del plazo.
- Un cambio operativo emite `flight.status_changed` a `search`. Repetir el mismo estado conserva la versión y no emite otro evento. Para un asiento existente en un vuelo cancelado, un `hold` nuevo o una confirmación con clave sin usar devuelve `409 FLIGHT_CANCELLED`. Si la cancelación toma primero la fila del vuelo y hace *commit* durante un `hold` o una confirmación, la operación de inventario revierte sus cambios y devuelve ese mismo `409`.
- Al conectar o reconectar, la instantánea incluye `myHold` solo para el titular de un bloqueo vigente. Si llega un `seat.changed` antes del reconocimiento, el cliente conserva el estado con la versión mayor. Tras perder eventos durante una desconexión, la siguiente instantánea recupera el estado actual de los asientos.
- Al pasar del vuelo A al vuelo B, la nueva conexión recibe el inventario de B y el cliente descarta los *acks* tardíos de A. Si un `flight.status_changed` llega antes que la respuesta de búsqueda, la fila muestra los datos de catálogo de la respuesta con el estado de la versión más alta.
