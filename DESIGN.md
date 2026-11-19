---
version: 1.1.0
name: AeroPulse
description: Sistema visual aeronáutico para la búsqueda, reserva de vuelos y consulta de ocupación en tiempo real en Colombia.
colors:
  primary: "#0474C4"              # Azul aviación vibrante (CTA principal, enlaces activos, foco)
  primary-hover: "#06457F"        # Azul nocturno profundo (hover y estados presionados)
  header-bg: "#262B40"            # Azul marino profundo (anclaje de cabecera principal y bottom bar)
  text-heading: "#262B40"         # Títulos de alta jerarquía (H1, H2) sobre superficies claras
  text-body: "#2C444C"            # Gris pizarra oscuro neutro (textos de lectura, microcopy, ayuda UTC)
  text-muted: "#5379AE"           # Azul pizarra intermedio (subtítulos, etiquetas secundarias, iconos neutros)
  accent-soft: "#A8C4EC"          # Azul cielo sutil (fondos de badges, tintes de iconos al 10-15%, bordes suaves)
  surface: "#FFFFFF"              # Blanco puro dominante (tarjetas de formularios, módulos interactivos)
  background: "#F8FAFC"           # Gris neutro aireado (fondo global de la aplicación)
  outline: "#E2E8F0"              # Gris neutro claro (bordes de contenedores e inputs)
  outline-focus: "#0474C4"        # Borde de foco activo
  status-live: "#10B981"          # Verde esmeralda (indicadores «EN VIVO», rutas y frecuencias activas)
  error: "#DC2626"                # Rojo alerta (validaciones de formulario, errores de ruta o fecha)
  error-bg: "#FEF2F2"             # Fondo suave para contenedores de error
  available: "#216344"
  held: "#795000"
  held-container: "#FFF2CF"
  booked: "#344E60"
  booked-container: "#E0E9EE"
typography:
  fontFamily: "'Roboto', sans-serif"
  weights:
    regular: 400
    medium: 500
    bold: 700
    black: 900
  scale:
    h1:
      fontSize: "30px"
      fontWeight: 700
      lineHeight: 1.2
    h2:
      fontSize: "22px"
      fontWeight: 700
      lineHeight: 1.3
    body:
      fontSize: "15px"
      fontWeight: 400
      lineHeight: 1.5
    label:
      fontSize: "12px"
      fontWeight: 700
      lineHeight: 1.4
      textTransform: "uppercase"
      letterSpacing: "0.05em"
    helper:
      fontSize: "13px"
      fontWeight: 400
      lineHeight: 1.4
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
components:
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  flight-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-heading}"
    rounded: "{rounded.lg}"
---

# AeroPulse Aviation Suite

## Identidad y tipografía

La interfaz toma como referencia un tablero de operaciones aeronáuticas. Aplica la proporción 70/20/10. Dedica alrededor del 70 % a fondos claros y tarjetas blancas con borde fino y sombra suave, el 20 % a cabecera, títulos y texto, y el 10 % al azul aviación de las acciones. En los resultados, alinea horas y precios para comparar vuelos de un vistazo. En la compra, da prioridad al asiento, al plazo y al total.

Usa Roboto con H1 de 30 px, H2 de 22 px, cuerpo de 15 px y ayudas de 13 px. Las etiquetas de campo llevan 12 px, peso 700, mayúsculas y espaciado de 0,05 em. Aplica `font-variant-numeric: tabular-nums` a fechas, horas, frecuencias, tarifas, contadores y cuenta regresiva. Escribe en español de Colombia. Presenta «Bogotá (BOG)», «COP 240.000» y «04:12». La fecha de búsqueda y los itinerarios se expresan en UTC. Si se incluye el reloj de Colombia en la cabecera, rotúlalo, por ejemplo, «14:32 UTC-5».

## Cabecera y navegación

Sobre la cabecera marina coloca un ala estilizada blanca con acento azul junto a «AeroPulse». La píldora «EN VIVO» combina texto claro y punto esmeralda con pulso discreto cuando los datos están sincronizados. Al perder la conexión, sustituye el indicador por «Sin conexión». Muestra «Conexión restablecida» al recuperar los datos y conserva el último inventario visible durante la espera.

Desde 1024 px centra el contenido en un ancho máximo de 1120 px. La cabecera horizontal incluye «Buscar vuelos», «Consultar boleto», «Estado de vuelos» y un icono de perfil a la derecha como referencia visual. «Estado de vuelos» conduce a la lista de vuelos y desde allí a «Ver ocupación» para un vuelo concreto. El perfil funciona como identificador visual. En el panel protegido identifica el contexto como «Administración».

A 360 px deja márgenes de 16 px. Traslada los tres destinos de navegación a una barra inferior marina fija con iconos, etiquetas y áreas de al menos 48 px de alto. Indica el destino activo con texto y una marca visible. Reserva espacio bajo la última acción para la barra y el área segura del dispositivo.

## Búsqueda y resultados

En escritorio ordena la tarjeta de búsqueda en una fila con origen, intercambio, destino, fecha y acción. En móvil apila los campos y centra el botón circular de intercambio entre los dos selectores. Usa «ORIGEN · SALIDA» y «DESTINO · LLEGADA» como etiquetas persistentes. Debajo de la ciudad y el código IATA muestra el nombre del aeropuerto, por ejemplo «Aeropuerto El Dorado». El botón «Intercambiar origen y destino» permuta las dos selecciones y conserva la fecha.

Presenta la fecha con icono de calendario y una tira de días adyacentes. Para «19 nov 2026», muestra 17, 18, 19, 20 y 21, destaca el 19 y señala qué días se pueden consultar. Al elegir otro día, consulta la misma ruta para esa fecha. El botón «Buscar vuelos» usa icono y texto blancos, radio de 8 px, azul aviación en reposo y azul profundo al pasar el puntero o presionar. Su altura mínima es de 44 px en escritorio y 50 px en móvil. Los demás controles táctiles miden al menos 44 × 44 px.

Dibuja cuatro estados del formulario. En reposo conserva las selecciones válidas. Si los aeropuertos coinciden, aplica borde rojo y fondo de error al campo de destino, con «Elige un destino distinto del origen». Si la fecha es inválida, pon la ayuda justo debajo. Mientras se consulta, el botón muestra un indicador de progreso y «Buscando…». Los esqueletos iniciales ocupan el espacio de las tarjetas de itinerario. Presenta los resultados como filas comparables en escritorio y tarjetas en móvil.

## Asientos, ocupación y compra

| Componente | Aplicación |
| --- | --- |
| Mapa de cabina | Conserva pasillo, códigos y leyenda. Disponible lleva contorno verde y asiento hueco. Bloqueado lleva candado y ámbar. Reservado lleva asiento ocupado sobre gris azulado. Para el titular añade borde doble azul aviación, «Mi asiento» y el tiempo restante. |
| Ocupación | Reutiliza los símbolos del mapa en «Disponibles», «Bloqueados» y «Reservados». Actualiza asiento y cifras a la vez. Usa esqueletos hasta recibir el inventario inicial. |
| Estado de vuelo | Usa «Programado», «Retrasado» con reloj o «Cancelado» con icono de cancelación. «Agotado» es una segunda insignia que puede acompañar a cualquiera de las tres. |
| Pago simulado | Coloca el formulario junto al resumen del vuelo en escritorio. En móvil muestra primero el asiento y el tiempo restante, y deja el total y «Confirmar reserva» al final, por encima de la barra inferior. Explica el rechazo junto al campo mientras el bloqueo siga vigente. |
| Boleto y consulta | Centra el boleto en una tarjeta de hasta 680 px. Destaca el código seleccionable, seguido de ruta, horario, pasajero, asiento e importe. La consulta por código y apellido recupera el mismo diseño. |
| Administración | Antes de cancelar, identifica el vuelo y la consecuencia. Pon el foco inicial en «Volver» y devuélvelo al control de origen al cerrar el diálogo. |

## Contraste y foco

Usa el azul pizarra secundario para iconos o texto grande. En etiquetas y ayudas pequeñas usa el color de cuerpo para alcanzar 4,5:1 sobre blanco y sobre el fondo global. En errores sobre rosa, usa rojo para icono y borde y el color de cuerpo para el mensaje. El verde esmeralda identifica actividad con un punto acompañado de texto. Los bordes claros separan tarjetas. Refuerza con un contorno de mayor contraste los controles cuya forma permita identificarlos.

En superficies claras usa foco azul aviación de 3 px con separación de 2 px. En las barras marinas añade un halo blanco para que el foco siga siendo visible. Conserva el foco y la posición de lectura al actualizar información en vivo. Anuncia el vencimiento del bloqueo una vez y respeta la preferencia de movimiento reducido al representar el pulso o la carga.
