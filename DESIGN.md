---
version: 1.2.0
name: AeroPulse Aviation Suite
description: Sistema visual y guía de diseño oficial para la reserva de vuelos, monitoreo de ocupación en vivo y despacho operacional de AeroPulse en Colombia.
colors:
  primary: "#0474C4"
  primary-hover: "#06457F"
  primary-light: "#A8C4EC"
  on-primary: "#FFFFFF"
  header: "#262B40"
  on-header: "#FFFFFF"
  background: "#F8FAFC"
  surface: "#FFFFFF"
  surface-dim: "#F1F5F9"
  surface-container: "#F8FAFC"
  on-surface: "#262B40"
  on-surface-variant: "#2C444C"
  text-muted: "#5379AE"
  border: "#E2E8F0"
  border-light: "#EDF2F7"
  status-live: "#10B981"
  status-live-bg: "rgba(16, 185, 129, 0.12)"
  available: "#166534"
  available-border: "#22C55E"
  available-container: "#DCFCE7"
  held: "#795000"
  held-border: "#EAB308"
  held-container: "#FEF9C3"
  booked: "#1E293B"
  booked-border: "#64748B"
  booked-container: "#E2E8F0"
  my-seat: "#0474C4"
  my-seat-container: "#E0F2FE"
  error: "#DC2626"
  error-container: "#FEF2F2"
  warning: "#D97706"
  warning-container: "#FFFBEB"
typography:
  fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  h1:
    fontSize: "30px"
    fontWeight: "700"
    lineHeight: "1.2"
    letterSpacing: "-0.01em"
  h2:
    fontSize: "22px"
    fontWeight: "600"
    lineHeight: "1.25"
  body:
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "1.5"
  caption:
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.4"
  label:
    fontSize: "12px"
    fontWeight: "700"
    lineHeight: "1.4"
    letterSpacing: "0.05em"
    textTransform: "uppercase"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "4px"
  button: "8px"
  card: "12px"
  full: "9999px"
layout:
  maxContentWidthDesktop: "1120px"
  canvasWidthDesktop: "1440px"
  canvasWidthMobile: "360px"
  mobileMargin: "16px"
  touchTargetMin: "44px"
  bottomNavHeight: "56px"
---

# AeroPulse Aviation Suite — Guía de Diseño (DESIGN.md)

## 1. Identidad y Filosofía
AeroPulse es una plataforma web aeronáutica colombiana de alta fidelidad para la búsqueda, reserva, asignación de asientos y monitoreo telemétrico de vuelos en tiempo real.

- **Concepto rector**: Inspirado en los tableros de salidas y telemetría de radar aeronáutico civil (ADS-B / EASA / Aerocivil). Prioriza la legibilidad instantánea de rutas, horarios, tarifas y estado de ocupación.
- **Marca institucional**: «AeroPulse» acompañada del isotipo del ala aerodinámica en cabecera. En vistas restringidas u operacionales se complementa con la insignia de operador **«ADMINISTRACIÓN»**.
- **Tono y localización**: Español de Colombia. Nomenclatura explícita con código IATA en cada ciudad, ej.: `Bogotá (BOG) → Medellín (MDE)`. Moneda expresada en cifras enteras con puntuación estándar, ej.: `COP 240.000`. Formato horario militar de 24 horas con huso visible, ej.: `20:00 UTC` o `14:32:08 UTC`.

---

## 2. Paleta de Color y Roles Semánticos

| Rol | Color HEX | Uso principal |
|---|---|---|
| **Fondo Global** | `#F8FAFC` | Lienzo neutro claro institucional sobre el que reposan las tarjetas. |
| **Cabecera y Títulos** | `#262B40` | Azul marino profundo para la barra de navegación superior, pie de página y títulos principales H1/H2. |
| **Superficie** | `#FFFFFF` | Fondos de tarjetas elevadas, formularios y contenedores de datos. |
| **Texto de Lectura** | `#2C444C` | Gris azulado oscuro de alto contraste (cumple estándar WCAG AA ≥ 4.5:1). |
| **Texto Secundario / Muted** | `#5379AE` | Metadatos, etiquetas de apoyo y microcopy secundario. |
| **Bordes** | `#E2E8F0` | Límites estructurales de tarjetas, divisores y controles inactivos. |
| **Acción Primaria** | `#0474C4` | Azul aviación para botones principales (CTA), pestañas activas y acentos interactivos. |
| **Acción Hover / Pressed** | `#06457F` | Azul marino intenso para estados hover, focus activo y pulsación de botones primarios. |
| **Indicador "EN VIVO"** | `#10B981` | Pulso verde esmeralda para telemetría sincronizada en tiempo real. |
| **Alertas / Cancelación** | `#DC2626` | Rojo advertencia para vuelos cancelados, mensajes de error y modal de confirmación destructiva. |
| **Fondo Alertas** | `#FEF2F2` | Contenedor suave de advertencia con borde `#DC2626`. |

---

## 3. Tipografía y Reglas de Cifras
- **Fuente base**: `Roboto` (Google Fonts), con alternativas nativas de sistema sans-serif.
- **Escala tipográfica**:
  - **H1 (30 px, bold, leading 1.2)**: Títulos principales de pantalla e identificador de vuelo principal (`AP103`).
  - **H2 (22 px, semibold, leading 1.25)**: Encabezados de sección (ej. *Plano de Cabina*, *Desglose de facturación*).
  - **Cuerpo (15 px, regular, leading 1.5)**: Textos de párrafo, resúmenes e instrucciones.
  - **Ayudas / Metadatos (13 px, regular, leading 1.4)**: Horas de itinerario, terminales y notas operacionales.
  - **Etiquetas de campo (12 px, bold, mayúsculas, tracking 0.05 em)**: Etiquetas persistentes sobre inputs (`ORIGEN · SALIDA`, `DESTINO · LLEGADA`, `TOKEN DE ADMINISTRACIÓN`).
- **Cifras Tabulares (`font-variant-numeric: tabular-nums`)**: De uso obligatorio en horarios UTC, importes COP, temporizadores regresivos (`04:09`), porcentajes y contadores de ocupación para evitar saltos visuales al actualizarse.

---

## 4. Cuadrícula, Responsive y Composición

### Escritorio (1440 px)
- Contenedor centrado con ancho máximo de **1120 px** y margen automático.
- Cabecera marina superior `#262B40` con el logo/ala AeroPulse y los 3 destinos públicos:
  - **Buscar vuelos**
  - **Consultar boleto**
  - **Estado de vuelos**
- Estructura a dos columnas para flujos transaccionales (asientos y pago):
  - **Columna izquierda (60–65%)**: Contenido primario (cuadrícula de asientos o formulario de pago).
  - **Columna derecha (35–40%)**: Tarjeta fija de resumen de reserva, temporizador de retención y botón de acción principal.

### Móvil (360 px)
- Margen horizontal exacto de **16 px** por lado.
- Disposición estricta en una sola columna con flujo vertical fluido (`overflow-x: hidden`).
- **Navegación inferior marina fija (`bottom nav`)**:
  - Altura mínima: **56 px** (área táctil por icono/etiqueta ≥ 48 px).
  - Tres accesos públicos: *Buscar*, *Consultar boleto* y *Estado de vuelos* (o *Asientos* en flujo de compra).
  - Margen de seguridad inferior (`padding-bottom: 80px`) para evitar que la barra fija solape botones primarios.
- Controles táctiles accesibles con dimensiones mínimas de **44 × 44 px** (asientos y botones de acción). Botones principales de búsqueda y pago con altura de **48–50 px**.

---

## 5. Arquitectura del Contenedor de Asientos (Cabina 3 + 3)

El mapa de asientos de AeroPulse se rige por un estándar geométrico estricto implementado tras las últimas revisiones de usabilidad:

1. **Eliminación de adornos**:
   - Sin morro de avión, sin cabina de mando superior, sin alas exteriores decorativas ni etiquetas de turbinas.
   - La cabina inicia directamente bajo el encabezado de columnas con la primera fila de plazas.

2. **Cuadrícula simétrica de 7 columnas**:
   - **Columnas A, B, C**: Grupo izquierdo de tres plazas.
   - **Columna central (Pasillo)**: Columna estrecha y neutra donde se renderiza **únicamente el número de fila** centrado (`1`, `2`, `3`...).
   - **Columnas D, E, F**: Grupo derecho de tres plazas.
   - **Encabezado superior**: Letras `A  B  C  ·  D  E  F` fijas y alineadas verticalmente con las columnas de asientos.

3. **Fichas de asiento uniformes**:
   - Dimensiones compactas y cuadradas (mínimo 44 × 44 px para táctil).
   - Muestran el código completo una sola vez (ej. `1A`, `2B`).
   - Filas incompletas respetan el hueco de la columna vacía sin deformar la cuadrícula.

4. **Altura y scroll vertical interno**:
   - Para inventarios de hasta 3 filas (ej. configuración de 6 plazas), la altura se adapta automáticamente al contenido.
   - A partir de la 4.ª fila (inventario de 24 o más plazas), se activa un scroll vertical exclusivo dentro del cuerpo de la cabina (`overflow-y: auto`), manteniendo la cabecera de letras, la leyenda de convenciones, los contadores y las acciones siempre visibles fuera del scroll.
   - En móvil (360 px), las 7 columnas encajan sin generar desplazamiento horizontal.

---

## 6. Vocabulario y Estados de Inventario

| Estado | Símbolo / Icono | Estilo Visual | Interacción |
|---|---|---|---|
| **Disponible** | Asiento lineal hueco | Superficie blanca/verde suave, borde `#22C55E`, texto verde `#166534`. | Clickeable. Permite seleccionar/bloquear la plaza. |
| **Bloqueado** | Candado | Superficie ámbar `#FEF9C3`, borde `#EAB308`, icono y texto `#795000`. | Deshabilitado. En proceso de compra ajeno. |
| **Reservado** | Asiento con silueta ocupada | Superficie `#E2E8F0`, borde `#64748B`, icono y texto `#1E293B`. | Deshabilitado. Pasaje emitido o check-in realizado. |
| **Mi Asiento** | Asiento con etiqueta "MÍO" o "2A" | Borde reforzado azul institucional `#0474C4`, fondo `#E0F2FE`, texto `#0474C4`. | Seleccionado por el usuario actual con cuenta regresiva activa. |

### Estados del Vuelo
- **Programado**: Badge verde `#DCFCE7` con texto `#166534` y punto/icono de despegue.
- **Retrasado**: Badge ámbar `#FEF9C3` con texto `#795000` e icono de reloj.
- **Cancelado**: Badge rojo `#FEF2F2` con texto `#DC2626` e icono de alerta.
- **Agotado**: Insignia adicional que se añade como etiqueta de lectura cuando la ocupación alcanza el 100%.

---

## 7. Componentes Reutilizables por Pantalla

1. **01 Búsqueda y 02 Resultados**:
   - Tarjeta unificada de filtros: `ORIGEN` → Botón intercambio circular → `DESTINO` → `FECHA`.
   - En móvil, el botón de intercambio se ubica centrado verticalmente entre selectores.
   - Resultados de vuelo: Filas horizontales comparables en escritorio con desglose de tarifa y hora; tarjetas apiladas en móvil.
2. **03 Selección de Asientos y 04 Ocupación en Vivo**:
   - Comparten la misma cabina 3 + Pasillo + 3.
   - En selección: interactiva, con temporizador de retención (ej. `04:09`), desglose de tarifa y botón `Continuar al pago`.
   - En ocupación: modo solo lectura, con barra de distribución porcentual segmentada (Disponibles, Bloqueados, Reservados).
3. **05 Confirmación de Compra**:
   - Resumen del vuelo y asiento en cabecera o barra lateral antes del pago.
   - Formulario de pasajero y método de pago simulado con confirmación idempotente.
4. **06 Boleto Digital y 07 Consultar Boleto**:
   - Tarjeta central de pase de abordar de hasta **680 px** de ancho con código QR/barras, PNR destacado en mayúsculas (ej. `HK920X`), hora UTC y puerta de embarque.
   - En consulta: tarjeta de formulario centrada de hasta **520 px** con inputs para código de reserva y apellido.
5. **08 Administración Protegida**:
   - Cabecera con distintivo `ADMINISTRACIÓN`.
   - Autenticación por token criptográfico (`Token de administración`).
   - Acciones restringidas: `Marcar como retrasado` y `Cancelar vuelo`.
   - Modal accesible de confirmación destructiva: `¿Cancelar el vuelo AP103?` con botón inicial de foco en `Volver`.

---

## 8. Resiliencia, Conectividad y Accesibilidad (A11y)
- **Modo Desconectado**: Si la conexión falla, se mantiene la última vista renderizada y se muestra el banner de advertencia accesible: `«Sin conexión · Mostrando la última búsqueda»`.
- **Reconexión**: Al volver la red, se emite el aviso `«Conexión restablecida»` y se refresca el inventario sin perder el foco ni el estado del asiento bloqueado.
- **Foco visible**: Anillo de foco de 3 px con separación de 2 px (`outline: 2px solid #0474C4; outline-offset: 2px`).
- **Estados de carga (Skeletons)**: Efecto shimmer animado con la misma silueta y proporción de las tarjetas o asientos finales para evitar movimientos bruscos de layout (CLS = 0).
Principales novedades incorporadas en esta versión:
Paleta de Color Oficial: Incorporación de los roles #0474C4, #5379AE, #2C444C, #A8C4EC, #06457F y #262B40.
Estructura de Cabina 3 + Pasillo + 3: Formalización de la cuadrícula simétrica de 7 columnas, eliminación de adornos del fuselaje, números de fila centrados en el pasillo y especificación de scroll interno vertical para configuraciones de más de 3 filas.
Mapeo de las 8 Pantallas: Definición clara de tokens de layout, anchos máximos (1120 px en escritorio, 360 px en móvil con márgenes de 16 px) y componentes compartidos entre flujos públicos y protegidos.