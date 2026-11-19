# Reglas y decisiones de negocio · Reservas de vuelos

Este documento presenta el comportamiento esperado desde la perspectiva del negocio. Se deriva de [architecture.md](architecture.md), que conserva el diseño técnico. **Es documentación de análisis, no evidencia de funcionalidad implementada.** Las propuestas pendientes de validación se identifican expresamente.

## Alcance y conceptos

La kata permite buscar vuelos, seleccionar y bloquear temporalmente un asiento, confirmar una reserva con un pago simulado y consultar la ocupación de un vuelo. El catálogo es cerrado: los vuelos y sus asientos se crean mediante datos iniciales (*seed*).

| Concepto | Significado en la kata |
| --- | --- |
| Vuelo | Trayecto programado con origen, destino, horarios, tarifa y estado. |
| Asiento | Lugar identificado dentro de un vuelo, que puede estar disponible, bloqueado o reservado. |
| Bloqueo | Retención temporal de un asiento para un cliente mientras completa la compra. |
| Reserva | Confirmación de la compra de un asiento, con un código único y datos del pasajero. |
| Agotado | Indicador de que todos los asientos del vuelo están reservados; es independiente del estado operativo. |

Para este alcance no se plantea una entidad de aeronave ni un catálogo independiente de aeropuertos. Un vuelo contiene sus asientos.

## Catálogo y datos iniciales

Las siguientes decisiones están confirmadas en la sección 3.4 de arquitectura; describen datos para el prototipo, no una política general de una aerolínea.

| Tema | Decisión |
| --- | --- |
| Aeropuertos | Barranquilla (`BAQ`), Bogotá (`BOG`) y Medellín (`MDE`). |
| Rutas | Seis rutas dirigidas: cada combinación de origen y destino distintos entre los tres aeropuertos. |
| Horarios | Entre uno y tres por ruta y día; `BOG → MDE` tiene tres. |
| Fechas | Desde el día en que se ejecuta el seed hasta el último día del mes en curso, en UTC, con salidas futuras. |
| Capacidad habitual | 24 asientos por vuelo: filas 1 a 6 y letras A a D. |
| Vuelo de demostración | El tercer horario de `BOG → MDE` tiene seis asientos: filas 1 y 2, letras A a C. |
| Tarifa | Una tarifa por vuelo, expresada en pesos colombianos; se copia a la reserva al confirmar. |

La búsqueda por fecha y la visualización de horarios usan UTC. Si el seed se ejecuta el último día del mes, solo genera vuelos para ese día: es una limitación conocida de esta decisión.

## Búsqueda y estado de los vuelos

- La búsqueda utiliza origen, destino y fecha, y muestra horarios y tarifa.
- Los estados operativos previstos son programado (`SCHEDULED`), retrasado (`DELAYED`) y cancelado (`CANCELLED`).
- Un vuelo puede estar retrasado y agotado a la vez. Un vuelo cancelado no admite nuevos bloqueos ni confirmaciones.
- Los cambios de estado y de agotamiento deben reflejarse en los resultados sin recargar la página.

## Ciclo de vida del asiento

| Estado | Significado | Transiciones previstas |
| --- | --- | --- |
| Disponible (`AVAILABLE`) | Puede ser seleccionado. | Pasa a bloqueado cuando se obtiene la retención. |
| Bloqueado (`HELD`) | Está retenido temporalmente para un cliente. | Pasa a reservado con pago aprobado y bloqueo vigente; vuelve a disponible al liberarse o vencer. |
| Reservado (`BOOKED`) | La compra fue confirmada. | Permanece ocupado en el alcance de la kata. |

- El bloqueo previsto dura 300 segundos por defecto y puede configurarse en 30 segundos para la demostración.
- Un cliente puede tener un solo bloqueo activo por vuelo. Al elegir otro asiento, la propuesta libera el anterior si se obtiene el nuevo.
- El reintento del titular sobre su mismo bloqueo devuelve el bloqueo vigente sin ampliar su plazo.
- Solo el titular puede confirmar o liberar su bloqueo. Un bloqueo vencido no puede confirmarse.
- Liberar un bloqueo vencido o ya liberado no cambia el asiento. Una solicitud anterior tampoco puede liberar un bloqueo nuevo. [Contrato de liberación](contracts-and-open-questions.md#bloqueo-liberación-y-vencimiento).

## Confirmación, pago y boleto

- La confirmación requiere un bloqueo vigente, datos del pasajero y un pago simulado aprobado.
- Si el pago es rechazado, el asiento permanece bloqueado hasta que se libere o venza, y el cliente puede reintentar dentro del plazo.
- La confirmación exitosa ocupa el asiento y genera un boleto con un código único de seis caracteres. Los reintentos del mismo intento de compra deben devolver el mismo boleto.
- El diseño contempla consultar el boleto con el código y el apellido del pasajero.
- Para la demostración, las tarjetas de prueba terminadas en `4242` se aprueban y las terminadas en `0002` se rechazan; se valida el número con Luhn.
- No se conserva el número completo de tarjeta ni el CVV; se guardan solo los datos de pago mínimos descritos en arquitectura.

## Ocupación y experiencia esperada

- El mapa y el dashboard muestran los asientos disponibles, bloqueados y reservados, y reaccionan a sus cambios.
- La interfaz identifica el asiento propio y comunica el tiempo restante, los conflictos y la pérdida de conexión.
- Los estados deben ser distinguibles mediante texto o iconos además del color, y operables con teclado.

## Criterios de revisión

- [ ] Validar que el catálogo, la ventana de fechas y la tarifa cubren la demostración prevista.
- [ ] Validar la experiencia al cambiar de asiento y al vencer o liberar un bloqueo.
- [ ] Comprobar que se cumplan los [contratos entre frontend y backend](contracts-and-open-questions.md) al implementar los flujos.
- [ ] Contrastar estas reglas con la implementación y actualizar ambos documentos si cambia una decisión.
