---
version: alpha
name: AeroPulse
description: Sistema visual para la reserva de vuelos y la consulta de ocupación en tiempo real en Colombia.
colors:
  primary: "#005A70"
  on-primary: "#FFFFFF"
  background: "#F3F6F8"
  surface: "#FFFFFF"
  on-surface: "#142D42"
  on-surface-variant: "#465A68"
  outline: "#697E88"
  outline-variant: "#CFD9DE"
  available: "#216344"
  held: "#795000"
  held-container: "#FFF2CF"
  booked: "#344E60"
  booked-container: "#E0E9EE"
  error: "#A12D2D"
  error-container: "#FBE9E8"
typography:
  headline:
    fontFamily: system-ui
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: system-ui
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
rounded:
  md: 8px
components:
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  flight-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
---

# AeroPulse

## Identidad

La referencia visual es un tablero de salidas. Al comparar vuelos, el pasajero debe poder recorrer una misma columna con la mirada y encontrar la hora, la tarifa y el estado de cada opción. Al elegir un asiento, la prioridad pasa a su ubicación y al tiempo que queda para confirmar. Usa «AeroPulse» como marca tipográfica en la cabecera.

## Color y tipografía

Usa el azul noche de `on-surface` como fondo de cabecera con texto blanco y como tinta para títulos sobre superficies claras. Reserva el azul petróleo de `primary` para la acción principal, la navegación activa y el bloqueo propio. Dibuja los límites de controles con `outline` y los separadores de filas con `outline-variant`.

Usa cifras tabulares para horas, importes, contadores y cuenta regresiva. Escribe en español de Colombia. Conserva los códigos de aeropuerto junto a las ciudades, por ejemplo «Bogotá (BOG) → Medellín (MDE)». Expresa las horas como «20:00 UTC», la tarifa como «COP 240.000» y el tiempo restante como «04:12».

## Composición

Centra el contenido en un ancho máximo de 1120 px. Usa tarjetas blancas de radio 8 px sobre fondo gris azulado. En búsqueda, alinea los filtros sobre la lista. En el mapa y en la confirmación, usa dos columnas para mantener el resumen del asiento cerca de la acción. En el boleto, centra una sola tarjeta de hasta 680 px y da al código de reserva la mayor jerarquía.

A 360 px, deja 16 px de margen a cada lado. Apila filtros y acciones, convierte las filas de vuelo en tarjetas y conserva la cabina completa con su pasillo. En el pago móvil, presenta el asiento y el tiempo restante antes del formulario. Mantén las áreas táctiles en al menos 44 × 44 px.

## Componentes y estados

| Elemento | Tratamiento |
| --- | --- |
| Navegación | «Buscar vuelos» y «Consultar boleto» en el área pública. «Ver ocupación» aparece junto al vuelo. En el área protegida, coloca «Administración» junto a la marca. |
| Asiento disponible | Superficie blanca, contorno verde `available` e icono de asiento hueco. Permite seleccionarlo y conserva una leyenda visible. |
| Asiento bloqueado | Candado y texto ámbar `held` sobre `held-container`. Para el titular añade borde doble petróleo, etiqueta «Mi asiento» y tiempo restante. |
| Asiento reservado | Asiento ocupado y texto `booked` sobre `booked-container`. Mantén legible el código de plaza al deshabilitar la selección. |
| Estado del vuelo | Insignia con texto «Programado», «Retrasado» o «Cancelado». Para retraso usa reloj y ámbar. Para cancelación usa icono y rojo oscuro. Añade «Agotado» en una insignia independiente cuando se reserve la última plaza. |
| Ocupación | Alinea «Disponibles», «Bloqueados» y «Reservados» con los mismos símbolos que el mapa. Actualiza en el mismo marco el asiento afectado y sus contadores. |
| Formularios | Etiqueta persistente sobre cada campo y error específico debajo. En el pago identifica la simulación y conserva visibles el total y el vencimiento del bloqueo. |
| Cancelación de vuelo | En el diálogo identifica el número de vuelo y la consecuencia. Distingue «Volver» de «Sí, cancelar vuelo». El foco inicial va a «Volver» y al cerrar regresa al control que abrió el diálogo. |

## Actualizaciones y accesibilidad

En primera carga usa esqueletos con la forma del contenido esperado. Ante una desconexión mantén el último mapa o resultado visible y presenta «Sin conexión». Al recuperar los datos muestra «Conexión restablecida». Conserva la posición de lectura y el foco de teclado durante las actualizaciones.

Combina color, icono y etiqueta. Usa un anillo de foco de 3 px con separación de 2 px, petróleo sobre superficies claras y blanco sobre la cabecera oscura. Para un lector de pantalla identifica cada plaza por código y estado, por ejemplo «2A, bloqueado, mi asiento». Anuncia el vencimiento una vez y conserva el contador visual en cifras tabulares. Mantén contraste de texto de al menos 4,5:1 y respeta la preferencia de movimiento reducido.
