# AeroPulse · Prompts de mockups para Google Stitch

> **Qué es este documento.** Son los prompts con los que se generaron en [Google Stitch](https://stitch.withgoogle.com/projects/9552478381435950379) los mockups de escritorio (1440 px) y móvil (360 px) de las ocho vistas de AeroPulse, antes de implementar el frontend. El sistema visual resultante quedó en [DESIGN.md](../DESIGN.md), y el proceso completo, incluida la conexión de Stitch por MCP con los agentes de código, se resume en [Uso de IA](ia.md#diseño-de-interfaz-con-google-stitch). El párrafo «Alcance comprobado» describe el estado del frontend cuando se escribieron los prompts, no el actual.

## 1. Contexto global y sistema de diseño

Carga el [DESIGN.md de AeroPulse Aviation Suite](../DESIGN.md) en Stitch. Usa el bloque base para fijar el contexto y pega un prompt por vez en el mismo proyecto. Usa la primera pantalla aprobada como referencia visual para la siguiente. Cada prompt pide una vista principal y, cuando corresponde, variantes de esa misma vista en marcos separados.

```text
Define la base visual de AeroPulse, una aplicación web colombiana de reservas de vuelos en tiempo real. El pasajero busca un vuelo, bloquea un asiento por tiempo limitado y confirma la compra con un pago simulado. Un espectador consulta la ocupación en vivo. Un operador autorizado puede retrasar o cancelar un vuelo.

Aplica el sistema AeroPulse Aviation Suite 1.1.0. Usa un tablero aeronáutico con proporción 70/20/10. Predominan el fondo #F8FAFC y las tarjetas blancas con borde #E2E8F0 y sombra suave. Usa #262B40 en títulos y cabecera, #2C444C en textos y #0474C4 para acciones con texto blanco y foco. En hover y al presionar usa #06457F. Roboto con H1 de 30 px, H2 de 22 px, cuerpo de 15 px, ayudas de 13 px y etiquetas de 12 px en mayúsculas, negrita y espaciado de 0,05 em. Aplica cifras tabulares a fechas, horarios, frecuencias, tarifas y contadores. Usa espacios de 4, 8, 16, 24 y 32 px, radio de 8 px en botones y hasta 12 px en tarjetas.

En la cabecera marina coloca el ala blanca con acento azul y la marca AeroPulse. En escritorio desde 1024 px alinea «Buscar vuelos», «Consultar boleto» y «Estado de vuelos», con icono de perfil a la derecha. Mantén el contenido centrado hasta 1120 px. «Estado de vuelos» abre la lista con sus filtros y cada vuelo ofrece «Ver ocupación». En el área protegida identifica «Administración». Si los datos están sincronizados muestra la píldora «EN VIVO» con punto #10B981. Si incluyes un reloj de Colombia rotúlalo «UTC-5». Muestra las horas de los itinerarios en UTC.

A 360 px conserva 16 px de margen. Lleva la navegación a una barra marina inferior fija con iconos, etiquetas y blancos táctiles de 48 px de alto como mínimo. Deja espacio debajo del contenido para que la barra no tape la última acción. Usa al menos 44 × 44 px en los controles y 50 px de alto en el botón móvil de búsqueda.

Mantén un vocabulario fijo para el inventario. «Disponible» lleva contorno verde oscuro y asiento hueco. «Bloqueado» lleva ámbar oscuro y candado. «Reservado» lleva fondo gris azulado e icono de asiento ocupado. Un bloqueo propio añade borde doble azul y la etiqueta «Mi asiento». Mantén una leyenda junto al mapa. Para vuelos, usa insignias con texto «Programado», «Retrasado» o «Cancelado». «Agotado» es una insignia adicional que puede coexistir con cualquiera de ellas. Usa #DC2626 en bordes e iconos de error y #FEF2F2 como fondo de alerta, con el mensaje en #2C444C.

Escribe en español de Colombia. Muestra el código del aeropuerto junto a la ciudad, la hora de 24 horas con UTC explícito y los importes enteros en el formato «COP 240.000». Usa etiquetas persistentes en formularios, foco visible y contraste AA. Distingue estados con texto e icono además del color. En vistas en vivo, reserva espacio para «Sin conexión» y «Conexión restablecida» sin desplazar los controles. Trata los mensajes dinámicos como avisos accesibles y conserva el foco al actualizar datos.
```

**Alcance comprobado.** El componente raíz muestra «AeroPulse» y un punto de salida para el enrutador. La tabla de rutas Angular está vacía y los directorios de funcionalidades están reservados. Roboto, la paleta y la composición corresponden al diseño aplicado en Stitch. Las vistas y transiciones proceden del diseño funcional documentado. [Componente raíz](../frontend/src/app/app.component.html) · [Rutas](../frontend/src/app/app.routes.ts) · [Estilos](../frontend/src/styles.scss) · [Hitos del frontend](handoff/frontend.md)

**Datos del recorrido.** El catálogo fija BAQ, BOG y MDE, una tarifa por vuelo y un tercer horario BOG → MDE con seis asientos. Los números de vuelo, importes, horas, fecha y código de boleto que siguen forman un ejemplo coherente para Stitch. Conserva esos valores al pasar de una vista a otra. [Reglas de negocio](handoff/business-rules.md) · [Modelos de persistencia](handoff/persistence.md) · [Contratos de vuelo, asiento, bloqueo y boleto](handoff/contracts-and-open-questions.md)

## 2. Mapa de pantallas y fases de generación

| Fase | Pantallas | Conexión en el prototipo |
| --- | --- | --- |
| 1 · Encontrar vuelo | 01 Búsqueda inicial · 02 Resultados en vivo | La búsqueda lleva a los resultados con los filtros aplicados. «Estado de vuelos» reutiliza la lista. Desde cada vuelo se puede consultar la ocupación y, si admite reservas, elegir asiento. |
| 2 · Seleccionar y observar | 03 Mapa de asientos · 04 Ocupación del vuelo | El pasajero continúa al pago con un bloqueo propio vigente. El espectador consulta los mismos asientos en modo lectura. |
| 3 · Confirmar y recuperar | 05 Confirmación y pago simulado · 06 Boleto · 07 Consulta por código y apellido | Una compra aprobada abre el boleto. La consulta pública permite recuperarlo después. |
| 4 · Operar el vuelo | 08 Administración del estado | Un operador identifica el vuelo y modifica su estado. El resultado se refleja en las vistas públicas abiertas. |

Los números identifican marcos de diseño. Búsqueda y resultados pueden compartir página, y el boleto es la misma vista al comprar y al consultar. El mapa sigue las cuatro historias de la kata y el área de administración prevista en la arquitectura. [Historias y criterios de experiencia](architecture.md)

## 3. Prompts individuales para Google Stitch

### Fase 1 · Encontrar vuelo

#### 01 · Búsqueda inicial

```text
Diseña «Buscar vuelos» de AeroPulse Aviation Suite a 1024 px o más y a 360 px. Aplica Roboto, cabecera #262B40 con ala blanca y acento azul, tarjetas blancas de radio 12 px y fondo #F8FAFC. Marca «Buscar vuelos» como activo junto a «Consultar boleto» y «Estado de vuelos». Coloca perfil a la derecha en escritorio y los tres destinos con icono y etiqueta en la barra inferior fija en móvil. Para la conexión sincronizada muestra «EN VIVO» con punto esmeralda.

En escritorio alinea «ORIGEN · SALIDA», botón circular de intercambio, «DESTINO · LLEGADA», «FECHA DE SALIDA» y «Buscar vuelos». Muestra Bogotá (BOG) y Medellín (MDE), con «Aeropuerto El Dorado» y «Aeropuerto José María Córdova» en segunda línea. Incluye Barranquilla (BAQ) entre las opciones. Da al botón circular el nombre accesible «Intercambiar origen y destino». Al activarlo permuta ambos aeropuertos y conserva la fecha. En móvil apila los campos y centra ese botón entre origen y destino.

En la fecha usa icono de calendario, «19 nov 2026» y cinco selectores adyacentes 17, 18, 19, 20 y 21. Marca el 19 como seleccionado, distingue los días disponibles y aplica la elección a la misma ruta. Añade «La fecha y los horarios se muestran en UTC». Precarga una fecha con salidas futuras del mes cuando existan. El botón de búsqueda usa #0474C4, icono y texto blancos, radio de 8 px y altura mínima de 44 px en escritorio y 50 px en móvil.

Genera cuatro marcos del mismo formulario. Primero, listo para buscar, con el espacio de resultados libre. Segundo, Bogotá en ambos campos, borde #DC2626, fondo #FEF2F2, foco en Destino y mensaje «Elige un destino distinto del origen». Tercero, fecha inválida con «Ingresa una fecha válida» debajo de la fecha. Cuarto, «Buscando…» con indicador de progreso en el botón y esqueletos del tamaño de las tarjetas de itinerario. Mantén la última acción visible sobre la barra inferior.
```

#### 02 · Resultados en vivo

```text
Diseña la vista pública responsive «Vuelos de Bogotá a Medellín» de AeroPulse. Aplica AeroPulse Aviation Suite con Roboto, cabecera marina #262B40 y acciones #0474C4. En móvil conserva la barra inferior fija. Reutiliza la tarjeta de búsqueda con «ORIGEN · SALIDA», intercambio circular, «DESTINO · LLEGADA», calendario, tira de días y «Buscar vuelos», con Bogotá (BOG), Medellín (MDE) y 19 nov 2026 seleccionados. Encabeza la lista con «3 vuelos» y «Horarios en UTC». Al entrar por «Estado de vuelos», activa ese destino y reutiliza los filtros y las filas para llegar a «Ver ocupación». Vincula «EN VIVO» al estado de sincronización.

En escritorio crea filas comparables con número, salida y llegada UTC, ruta BOG → MDE, tarifa, estado operativo y acciones. Ordena por salida. Usa AP101, 12:00–13:00, COP 210.000, Cancelado. Usa AP102, 16:00–17:00, COP 230.000, Retrasado. Usa AP103, 20:00–21:00, COP 240.000, Programado. Destaca «Elegir asiento» en vuelos que admiten bloqueo, con «Ver ocupación» como enlace secundario en cada fila. El vuelo cancelado permanece visible con el motivo de indisponibilidad. En móvil convierte cada fila en una tarjeta con horas y tarifa alineadas y acciones debajo.

Genera una variante posterior de la misma lista en la que AP102 conserva «Retrasado» y añade «Agotado» tras la última compra. Impide elegir asiento en cancelados y agotados. Indica que los cambios llegan en el lugar que ocupa la fila, conservando filtros y foco. Para cero coincidencias usa «No hay vuelos para esta ruta y fecha» y «Cambiar fecha». Para fallo de consulta ofrece «Reintentar». Distingue la primera carga con esqueletos de una caída de la conexión en vivo con resultados previos, que lleva el aviso «Sin conexión · Mostrando la última búsqueda».
```

### Fase 2 · Seleccionar y observar

#### 03 · Mapa y bloqueo temporal

```text
Diseña «Elige tu asiento», web responsive de AeroPulse, con Roboto, cabecera marina #262B40 y acción azul aviación #0474C4. En móvil reserva espacio para la barra inferior fija tras el resumen. Usa el indicador «EN VIVO» mientras el inventario esté sincronizado. Identifica AP103, Bogotá (BOG) → Medellín (MDE), 19 nov 2026, 20:00–21:00 UTC y COP 240.000. Ofrece «Volver a resultados» y «Ver ocupación». En escritorio coloca el mapa a la izquierda y «Mi asiento» a la derecha. A 360 px coloca la leyenda, la cuadrícula y el resumen en una sola columna.

El contenedor muestra únicamente la cuadrícula de asientos. Elimina la ilustración de la cabina de mando, el morro del avión y el espacio que ocupaban. Cada fila visual completa tiene seis asientos en dos grupos de tres separados por un espacio central. Conserva los códigos reales en su orden y admite filas parciales, incluso de un solo asiento. En el vuelo de demostración muestra una fila «1A 1B 1C | 2A 2B 2C». Los códigos 1A, 2B y 2C están disponibles, 1B está bloqueado, 1C está reservado y 2A es el bloqueo propio. Usa icono, color y leyenda escrita. Añade borde doble a 2A y muestra «Mi asiento · 2A» en el resumen. Mantén los botones con foco visible y nombres accesibles como «2A, bloqueado, mi asiento».

Muestra hasta tres filas en el área visible, tanto en escritorio como a 360 px. Si hay más filas, permite desplazarse verticalmente dentro de la cuadrícula hasta la última plaza, con rueda, gesto táctil o teclado. Mantén la leyenda y el resumen fuera del área desplazable. Usa el ancho disponible para que quepan ambos grupos sin desplazamiento horizontal. Si solo hay una fila, ajusta el alto del contenedor a esa fila. Para demostrar el desplazamiento, usa la variante de 24 plazas como cuatro filas visuales de seis, con los códigos originales.

En el resumen principal muestra «Tiempo restante 04:12», «Continuar al pago» y «Liberar asiento». El plazo habitual es de 5 minutos desde que el servidor acepta el bloqueo. Repetir la selección o recargar mantiene el tiempo restante. Antes de elegir, muestra «Selecciona un asiento disponible». Al pulsar una plaza disponible, señala «Bloqueando…» hasta obtener respuesta. Si falla un cambio de asiento, muestra «Alguien tomó ese asiento» junto al mapa y conserva el bloqueo anterior si sigue vigente. Si el cambio tiene éxito, mueve la marca propia al nuevo y libera el anterior.

Representa las variantes por separado. Al vencer el bloqueo, retira la acción de pago y muestra «El tiempo terminó. Elige un asiento disponible». Al liberar voluntariamente vuelve al estado de selección. Al cancelarse el vuelo impide nuevos bloqueos y compras y permite liberar el bloqueo propio vigente. Para la carga inicial usa esqueletos con la forma de las filas de asientos. Si el inventario llega vacío, escribe «No hay asientos para mostrar». Ante una desconexión conserva la última cuadrícula con «Sin conexión» y, al recuperar datos, restaura «Mi asiento» solo si el bloqueo continúa vigente.
```

#### 04 · Ocupación del vuelo

```text
Diseña una web responsive de monitoreo público de AeroPulse titulada «Ocupación del vuelo». Es una vista de lectura para un espectador o administrador. Usa Roboto, cabecera marina #262B40 y píldora «EN VIVO» con punto esmeralda. Activa «Estado de vuelos» en la cabecera de escritorio y en la barra inferior fija móvil. Reutiliza los mismos símbolos de asiento disponible, bloqueado y reservado. Sitúa AP103 y «Programado» encima de Bogotá (BOG) → Medellín (MDE), 19 nov 2026, 20:00–21:00 UTC. Añade «Volver a resultados».

Da máxima jerarquía a tres contadores alineados, con títulos, números tabulares e iconos. Para este vuelo de seis plazas muestra «Disponibles 3», «Bloqueados 2» y «Reservados 1». Debajo de la leyenda, usa la misma cuadrícula de «Elige tu asiento» en modo de solo lectura. Elimina la cabina de mando y el espacio que ocupaba. Muestra una fila «1A 1B 1C | 2A 2B 2C», con dos grupos de tres separados por un espacio central. Disponibles 1A, 2B y 2C. Bloqueados 1B y 2A. Reservado 1C. Mantén los contadores y la leyenda visibles fuera del área desplazable. El enlace del detalle vuelve a los resultados que originaron la consulta.

En escritorio y a 360 px, el contenedor muestra hasta tres filas y permite desplazamiento vertical interno cuando hay más. Cada fila completa admite seis plazas. Conserva los códigos originales y admite filas incompletas, incluso de un solo asiento. Ajusta el alto al inventario cuando hay menos de tres filas. En móvil usa filas compactas para las métricas y conserva ambos grupos visibles sin desplazamiento horizontal. Permite recorrer toda la cuadrícula con rueda, gesto táctil o teclado.

Pide un segundo marco tras la compra de 2A. Las cifras pasan a 3, 1 y 2 y el asiento cambia a reservado en el mismo instante. Si el bloqueo hubiera vencido, las cifras serían 4, 1 y 1. En la primera carga usa esqueletos hasta recibir el inventario. Durante una desconexión conserva las últimas cifras con «Sin conexión · Última ocupación conocida». Muestra «Conexión restablecida» tras sincronizar. Si el vuelo ya no se encuentra, ofrece «Volver a resultados».
```

### Fase 3 · Confirmar y recuperar

#### 05 · Confirmación y pago simulado

```text
Diseña «Confirmar reserva» en la web responsive de AeroPulse. Usa Roboto, cabecera marina #262B40, superficies blancas y un botón azul aviación #0474C4. En móvil deja visible el botón de confirmación sobre la barra inferior fija. En escritorio sitúa el formulario a la izquierda y el resumen a la derecha. A 360 px encabeza con el vuelo, 2A y la cuenta regresiva, sigue con los campos y termina con el total y la acción.

En «Datos del pasajero» incluye «Nombres» y «Apellidos», con Laura y Gómez como ejemplo. En «Pago simulado» pide un único campo «Número de tarjeta de prueba». Incluye una ayuda legible con «Prueba aprobada · 4242 4242 4242 4242» y «Prueba rechazada · 4000 0000 0000 0002». Los grupos facilitan la lectura y el valor enviado contiene solo dígitos. El resumen debe mostrar AP103, Bogotá (BOG) → Medellín (MDE), 19 nov 2026, 20:00–21:00 UTC, «Asiento 2A», «Tiempo restante 03:48» y «Total COP 240.000». Termina con «Confirmar reserva».

Muestra errores junto al campo correspondiente, como «Ingresa tus apellidos» y «Revisa el número de tarjeta de prueba». Mientras se recupera el bloqueo, dibuja un esqueleto de resumen. Sin bloqueo propio vigente presenta «Selecciona un asiento para continuar» con enlace al mapa. Durante el envío usa «Confirmando…» y evita otro envío. Una aprobación abre un solo boleto, incluso si se reintenta la misma compra.

Diseña variantes separadas de rechazo, expiración y cancelación. En rechazo conserva el resumen y el contador, enfoca el pago y muestra «Pago rechazado. Prueba otra tarjeta antes de que termine el bloqueo». Al expirar muestra «El bloqueo venció» con «Elegir asiento». Si se cancela el vuelo, muestra «Vuelo cancelado» con «Volver a resultados» y desactiva la confirmación. Si el intento ya confirmó datos distintos, orienta a «Consultar boleto» antes de iniciar otra compra.
```

#### 06 · Boleto de reserva

```text
Diseña el boleto digital de AeroPulse como web responsive. Usa Roboto, cabecera marina #262B40 con el ala de AeroPulse, fondo #F8FAFC y cifras tabulares para fecha, hora e importe. En móvil conserva la barra inferior fija con sus tres destinos. Centra una tarjeta blanca de hasta 680 px con un encabezado «Reserva confirmada» e icono de confirmación. Sitúa «Código de reserva» y el valor seleccionable «K7M4QX» como primer dato, en caracteres grandes con separación legible. Debajo escribe «Guarda este código y consulta tu boleto con tu apellido».

Agrupa la información en el orden de lectura del pasajero. Primero «Bogotá (BOG) → Medellín (MDE)» y «Vuelo AP103». Después «Salida · 19 nov 2026, 20:00 UTC» y «Llegada · 19 nov 2026, 21:00 UTC». Continúa con «Pasajero · Laura Gómez», «Asiento · 2A», «Importe confirmado · COP 240.000» y «Emitido el 19 nov 2026 a las 17:36 UTC». En escritorio alinea salida y llegada en dos columnas. En móvil conserva código y ruta arriba y apila los detalles.

El estado principal es la compra aprobada. Si se abre desde «Consultar boleto», reutiliza la misma tarjeta, el mismo código y la fecha original de emisión. Deja «Buscar vuelos» como salida al final. Limita el contenido al comprobante de reserva y sus datos públicos para el titular.
```

#### 07 · Consulta por código y apellido

```text
Diseña la vista pública «Consultar boleto» de AeroPulse como web responsive. Activa «Consultar boleto» en la cabecera de escritorio o la barra inferior fija móvil. Usa Roboto, fondo #F8FAFC, tarjeta blanca de hasta 520 px y botón azul aviación #0474C4. En móvil ocupa el ancho disponible con margen lateral de 16 px.

Bajo el título escribe «Ingresa el código de reserva y el apellido del pasajero». Coloca dos campos apilados con etiquetas persistentes «Código de reserva» y «Apellido del pasajero». Usa las ayudas «6 caracteres, por ejemplo K7M4QX» y «Tal como aparece en tu reserva, incluidas las tildes». El botón principal dice «Consultar boleto». Acepta el código en minúsculas. La coincidencia del apellido admite cambios de mayúsculas y conserva los acentos.

El estado inicial muestra campos vacíos. Para un código incompleto muestra el error junto al campo. En espera cambia el botón a «Consultando…». Para una búsqueda válida sin coincidencia usa el mismo aviso para ambas causas posibles, «No encontramos un boleto con ese código y apellido. Revisa ambos datos». Conserva los campos disponibles para corregirlos. En éxito con K7M4QX y Gómez muestra la tarjeta de boleto existente de Laura Gómez, AP103, asiento 2A, COP 240.000. Si falla la red, permite reintentar la consulta con los datos introducidos.
```

### Fase 4 · Operar el vuelo

#### 08 · Administración del estado del vuelo

```text
Diseña el área protegida «Administración · Estado del vuelo» como web responsive de AeroPulse. Identifica al operador con «Administración» junto al ala de AeroPulse en la cabecera marina #262B40. Usa Roboto, superficies blancas y acción #0474C4. En móvil deja espacio para la barra inferior fija y mantén las insignias de las vistas públicas. Crea un marco de acceso al panel con un campo enmascarado «Token de administración» y el botón «Acceder». Ante una operación no autorizada pide revisar el token con «Verifica el token de administración».

En el marco principal reutiliza los filtros con etiquetas «ORIGEN · SALIDA» y «DESTINO · LLEGADA», intercambio circular, calendario y tira de días. A la izquierda sitúa los resultados por número y salida UTC. A la derecha sitúa el detalle del vuelo seleccionado con ruta, horario, estado actual y acciones permitidas. A 360 px apila filtros, selección y detalle. Usa AP103, Bogotá (BOG) → Medellín (MDE), 19 nov 2026, 20:00–21:00 UTC, «Programado». Mantén visible «Agotado» como dato de lectura únicamente cuando todas las plazas estén reservadas.

Para Programado ofrece «Marcar como retrasado» y «Cancelar vuelo». En Retrasado la única transición nueva es «Cancelar vuelo». Antes de aplicar la cancelación, representa un diálogo «¿Cancelar el vuelo AP103?» con la explicación «Las nuevas selecciones de asiento y confirmaciones quedarán bloqueadas», los botones «Volver» y «Sí, cancelar vuelo», y foco inicial en «Volver». Devuelve el foco al contexto del vuelo al cerrar. Para Cancelado deja el detalle en lectura con «Este vuelo está cancelado».

Mientras se procesa un cambio, muestra «Actualizando…». Tras la respuesta confirma «AP103 marcado como retrasado» o «AP103 cancelado» y actualiza la insignia en la lista y en el detalle. Ante un cambio concurrente que ya impida retrasar el vuelo, recupera el estado actual y explica «El vuelo ya está cancelado». Si la búsqueda no arroja resultados, conserva los filtros para ajustarlos. El panel opera exclusivamente sobre el estado del vuelo.
```

## 4. Seguimiento de ejecución en Stitch

Los ocho prompts iniciales y la unificación visual se aplicaron en Stitch. El prompt 10 queda pendiente para corregir la cuadrícula de asientos en las vistas 03 y 04. Usa la última columna para verificar los flujos después de los ajustes.

| Vista | Generada en Stitch | Verificación después de los ajustes |
| --- | --- | --- |
| 01 · Búsqueda inicial | Sí | Intercambio de aeropuertos, tira de días, cuatro estados del formulario y botón de 50 px en móvil. |
| 02 · Resultados en vivo | Sí | Orden por salida, enlace de AP103 al mapa y combinación «Retrasado» + «Agotado». |
| 03 · Mapa y bloqueo temporal | Sí | Cuadrícula 3 + 3 sin cabina de mando, hasta tres filas visibles y desplazamiento hasta la última. Revisar también selección por teclado, cambio fallido y vencimiento. |
| 04 · Ocupación del vuelo | Sí | Misma cuadrícula en solo lectura, con contadores fuera del desplazamiento. Los contadores suman seis antes y después de reservar 2A. |
| 05 · Confirmación y pago simulado | Sí | Aprobación, rechazo con tiempo restante y bloqueo vencido. El asiento, la tarifa y el temporizador continúan desde el mapa. |
| 06 · Boleto de reserva | Sí | Código de seis caracteres, importe en COP y horarios UTC legibles en ambos anchos. |
| 07 · Consulta por código y apellido | Sí | Recuperación del mismo boleto y mensaje común si la combinación no coincide. |
| 08 · Administración del estado del vuelo | Sí | Acceso por token, foco del diálogo y estado terminal «Cancelado». Comparar el vuelo en resultados, mapa y confirmación tras cancelar. |

- [x] Ejecutar los ocho prompts de generación.
- [x] Aplicar la unificación visual del prompt 09.
- [ ] Ejecutar solo el prompt 10 para corregir los contenedores de asientos.
- [ ] Comparar las vistas 03 y 04 a 1440 px y 360 px con una fila de seis, una fila parcial de un asiento y un inventario de más de tres filas.
- [ ] Revisar los flujos de la tabla sobre las vistas actualizadas.

## 5. Prompt 09 · Unificación visual de las ocho vistas

Pega este bloque en el mismo proyecto de Stitch que contiene las ocho vistas. Usa el [DESIGN.md de AeroPulse](../DESIGN.md) como referencia del proyecto.

```text
Actualiza las ocho vistas existentes de AeroPulse en este proyecto y sus variantes generadas. El objetivo es que funcionen visualmente como una sola aplicación web responsive. Trabaja sobre las pantallas 01 Búsqueda inicial, 02 Resultados en vivo, 03 Mapa y bloqueo temporal, 04 Ocupación del vuelo, 05 Confirmación y pago simulado, 06 Boleto de reserva, 07 Consulta por código y apellido y 08 Administración del estado del vuelo. Conserva los datos, textos, acciones, enlaces, estados y orden del flujo de cada vista.

Usa DESIGN.md versión 1.1.0 como fuente de verdad. Cuando un mockup difiera de esa guía, corrige el mockup. Define una sola cabecera, una sola navegación móvil y una biblioteca compartida de componentes. Usa la Búsqueda inicial como referencia de composición para la cabecera y los formularios una vez alineada con DESIGN.md. Aplica esa misma base a las ocho vistas y a sus variantes de carga, error, vacío, desconexión, selección y confirmación cuando correspondan.

Excluye los contenedores de asientos de 03 y 04 de esta pasada de unificación. Mantén su geometría, iconos, leyenda y comportamiento de desplazamiento tal como están en el proyecto. Para modificar esa cuadrícula usa el prompt 10 por separado.

Unifica la cuadrícula y la navegación. En escritorio, revisa los marcos a 1440 px con un contenedor centrado de hasta 1120 px, márgenes y ejes de alineación comunes. Usa la cabecera #262B40 con el ala, la marca AeroPulse y los tres destinos públicos «Buscar vuelos», «Consultar boleto» y «Estado de vuelos». Identifica «Administración» en la vista protegida. En móvil a 360 px, deja 16 px de margen por lado, una columna y los tres destinos en la misma barra inferior marina fija con iconos, etiquetas y estado activo. Reserva el espacio de la barra y el área segura para que la última acción quede visible. Evita desbordamiento horizontal. Usa controles de al menos 44 × 44 px, navegación inferior de al menos 48 px de alto y botón de búsqueda de al menos 50 px en móvil.

Aplica los mismos roles de color y tipografía en todos los marcos. Fondo #F8FAFC, superficies #FFFFFF, cabecera y títulos #262B40, texto de lectura #2C444C y bordes de tarjeta #E2E8F0. Botón principal #0474C4 con texto blanco y estado hover o presionado #06457F. Usa #10B981 en el punto de «EN VIVO» cuando los datos estén sincronizados, y #DC2626 y #FEF2F2 para el borde y fondo de las alertas, con el mensaje en #2C444C. Aplica Roboto en todas las vistas con H1 de 30 px, H2 de 22 px, cuerpo de 15 px, ayudas de 13 px y etiquetas de campo de 12 px en negrita y mayúsculas con espaciado de 0,05 em. Usa cifras tabulares en horarios UTC, importes COP, métricas y cuenta regresiva. Usa la escala de espacios de 4, 8, 16, 24 y 32 px, radios de 8 px en botones y 12 px en tarjetas. Mantén contraste AA, foco visible y una familia de iconos.

Reutiliza componentes y respeta la composición que necesita cada tarea.
- En 01 y 02 usa la misma tarjeta de filtros, con orden origen, intercambio, destino, fecha y búsqueda. En móvil centra el botón de intercambio entre los selectores. En 02 conserva filas comparables en escritorio y tarjetas en móvil.
- En 03 y 04 unifica solo los elementos que rodean la cuadrícula. Mantén «Mi asiento» y la cuenta regresiva en el contexto de selección y los tres contadores en ocupación.
- En 03 y 05 usa el mismo componente de resumen para el vuelo, asiento, precio y vencimiento. En escritorio coloca el contenido principal a la izquierda y el resumen a la derecha. En 05 móvil muestra el asiento y el tiempo antes del formulario, con el total y «Confirmar reserva» al final.
- En 06 y 07 reutiliza el mismo boleto al confirmar o consultar. Centra la tarjeta del boleto hasta 680 px y la tarjeta del formulario de consulta hasta 520 px en escritorio. En móvil ocupa el espacio disponible con los márgenes comunes.
- En 08 reutiliza los filtros, insignias, botones y diálogo del mismo sistema visual. Conserva el contexto protegido, el acceso por token y la jerarquía del diálogo de cancelación.

Revisa las ocho vistas juntas antes de terminar. Para cada vista, deja los marcos de escritorio y móvil lado a lado y nómbralos con el número, el título y el ancho. Comprueba que coincidan la posición de la marca, los márgenes, la tipografía, la paleta, los botones, los campos, las insignias y los avisos. Comprueba la continuidad del vuelo AP103 y del asiento 2A entre resultados, mapa, ocupación, pago y boleto. Entrega las ocho vistas actualizadas en el mismo proyecto, con sus dos tamaños y las variantes existentes aplicando el mismo sistema.
```
