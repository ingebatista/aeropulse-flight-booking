# AeroPlus Flight Booking

Prototipo funcional de un sistema de reservas de vuelos en tiempo real, desarrollado como solución a la kata *Sistema de Reservas de Vuelos en Tiempo Real* (Full Stack Senior). Permite buscar vuelos, elegir un asiento en un mapa interactivo, bloquearlo de forma temporal, confirmar la reserva con un pago simulado y consultar el boleto. Los cambios de asiento y de estado de un vuelo llegan a todas las pestañas abiertas sin recargar, y el sistema evita que se reserve dos veces el mismo asiento (*double booking*).

- **Frontend:** Angular 21 (standalone, signals y *zoneless*).
- **Backend:** NestJS 11 como monolito modular, con REST y Socket.IO.
- **Base de datos:** PostgreSQL 17. El bloqueo y la confirmación de asientos usan sentencias `UPDATE` condicionales y restricciones únicas, para que nunca haya dos reservas del mismo asiento.
- **Contratos compartidos:** `packages/shared` (DTOs, errores y eventos), con salida ESM y CommonJS. Es el paquete compartido opcional que sugiere el enunciado.

## Acceso rápido

Con la aplicación levantada (`docker compose up --build`, ver [Ejecutar con Docker Compose](#ejecutar-con-docker-compose)):

| Qué | Dónde |
| --- | --- |
| Aplicación (búsqueda de vuelos) | `http://localhost:8080` (en desarrollo local, `http://localhost:4200`) |
| **Vista de administración** | `http://localhost:8080/admin/acceso` |
| **Token de administración** | `AeroPlus-admin-dev` |

> **¿Buscas el acceso de administrador?** Entra en `/admin/acceso` y escribe el token `AeroPlus-admin-dev`. Es el valor por defecto en desarrollo y en Compose, y se puede cambiar con la variable `ADMIN_TOKEN` (ver [Variables opcionales](#variables-opcionales)). Es la única vista protegida; permite marcar un vuelo como retrasado o cancelado, y el cambio llega a todas las pestañas en tiempo real. El resto de las vistas son públicas. El detalle está en [Accesos y rutas de la interfaz](#accesos-y-rutas-de-la-interfaz).

## Cobertura del enunciado

Cada historia de usuario de la kata y su regla de tiempo real, con el lugar donde se explica y donde se puede probar.

| Historia | Qué resuelve el sistema | Más detalle |
| --- | --- | --- |
| **HU1** · Búsqueda y filtro de vuelos | Búsqueda por origen, destino y fecha con tarifas y horarios. Si un vuelo pasa a retrasado, cancelado o agotado, el listado se actualiza sin recargar. | [Arquitectura §3.2 y §4.7](docs/architecture.md#47-cambios-de-estado-de-vuelos-hu1) · [Probar, pasos 7 y 8](#probar-la-aplicación) |
| **HU2** · Selección y bloqueo temporal | Mapa de asientos interactivo. Al elegir uno, se bloquea por 300 segundos (valor configurable) y los demás clientes lo ven «Bloqueado» al instante. Al vencer, se libera. | [Arquitectura §4.3 y §4.5](docs/architecture.md#43-bloqueo-atómico-idempotente-para-su-titular) · [Probar, pasos 3 y 6](#probar-la-aplicación) |
| **HU3** · Confirmación y reserva | Pago con tarjetas ficticias, boleto con código único de 6 caracteres y asiento «Reservado» para todos los clientes en tiempo real. | [Arquitectura §4.4](docs/architecture.md#44-confirmación-pago-simulado-y-agotado) · [Probar, pasos 4 y 5](#probar-la-aplicación) |
| **HU4** · Estado y ocupación del vuelo | Vista con los asientos disponibles, bloqueados y reservados, que reacciona a cada bloqueo, liberación por vencimiento y reserva confirmada. | [Arquitectura §3.2](docs/architecture.md#32-cómo-cubre-la-api-las-historias-de-usuario) · [Probar, paso 3](#probar-la-aplicación) |

Los requisitos técnicos y de entrega del enunciado se cubren así:

| Requisito del enunciado | Dónde está |
| --- | --- |
| Arquitectura libre y justificada | Monolito modular; [justificación en `docs/architecture.md` §3](docs/architecture.md#3-justificación-de-la-arquitectura) |
| Backend y frontend sugeridos | NestJS (backend) y Angular (frontend) |
| Tiempo real | Socket.IO sobre WebSocket, con REST para los comandos; [decisiones en §6](docs/architecture.md#6-decisiones-técnicas-clave) |
| Control de la concurrencia y del tiempo límite del bloqueo | [Concurrencia, §4](docs/architecture.md#4-concurrencia-y-estado-en-tiempo-real) |
| Estructura `backend/`, `frontend/`, `shared/` y `docs/` | [Estructura](#estructura); el paquete compartido es `packages/shared` |
| Documentos obligatorios `docs/architecture.md` y `docs/ia.md` | Enlaces en la tabla siguiente |
| Instrucciones de ejecución, diagrama y resumen | Este README |
| Verificación de lo anterior desde un clon limpio | [Evidencias de ejecución](docs/handoff/evidence/README.md#8--verificación-desde-un-clon-limpio) |

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | **Obligatorio.** Arquitectura, concurrencia, tiempo real y decisiones técnicas |
| [docs/ia.md](docs/ia.md) | **Obligatorio.** Uso de inteligencia artificial: herramientas, prompts, correcciones e impacto |
| [DESIGN.md](DESIGN.md) | Sistema visual de la interfaz: paleta, tipografía, composición responsive, estados y componentes |
| [docs/mockups-stitch-prompts.md](docs/mockups-stitch-prompts.md) | Prompts con los que se generaron en [Google Stitch](https://stitch.withgoogle.com/projects/9552478381435950379) los mockups de escritorio y móvil |
| [docs/handoff/business-rules.md](docs/handoff/business-rules.md) | Reglas de negocio, catálogo de vuelos y datos iniciales |
| [docs/handoff/persistence.md](docs/handoff/persistence.md) | Esquema, restricciones y migraciones |
| [docs/handoff/contracts-and-open-questions.md](docs/handoff/contracts-and-open-questions.md) | Rutas HTTP, eventos de Socket.IO y catálogo de errores |
| [docs/handoff/checklist.md](docs/handoff/checklist.md) | Seguimiento de tareas y [evidencias de M5](docs/handoff/evidence/README.md) |

## Arquitectura

```mermaid
flowchart LR
  FE["Angular 21 en el navegador"]
  NG["Nginx<br/>/api/* · /ws"]

  subgraph API["API · NestJS (monolito modular)"]
    CTRL["Controladores REST"]
    SVC["flights · inventory · payments · admin"]
    JOB["Barrido de expirados (1 s)"]
    BUS["EventBus<br/>en proceso, tras commit"]
    RT["Gateway Socket.IO /ws"]
  end

  DB[("PostgreSQL")]

  FE <-->|"HTTP /api"| NG
  FE <-->|"WebSocket /ws"| NG
  NG <--> CTRL
  NG <--> RT
  CTRL --> SVC
  JOB --> SVC
  SVC -- "transacciones · rol app" --> DB
  SVC -- "eventos confirmados" --> BUS --> RT
```

REST atiende las búsquedas y los comandos (bloquear, liberar, confirmar). Socket.IO difunde los cambios de asiento y de estado de vuelo a quienes están suscritos. Cada asiento y cada vuelo llevan una `version` que sube en cada cambio, y el cliente aplica un dato solo si su versión es mayor que la conocida. El tiempo de los bloqueos lo decide el reloj de PostgreSQL. El detalle y la justificación están en [docs/architecture.md](docs/architecture.md).

## Requisitos mínimos del equipo

Para ejecutar `docker compose up --build` **no hace falta** instalar Node.js, npm ni PostgreSQL: la compilación y la base de datos corren dentro de contenedores. Estos son los requisitos del equipo.

| Recurso | Mínimo | Recomendado |
| --- | --- | --- |
| Docker | Docker con **Compose v2** (se usa el comando `docker compose`, no el antiguo `docker-compose`) y contenedores Linux | Una versión reciente. El proyecto se desarrolló con Docker 29.9.3 y Compose v5.7.0 |
| Git | Cualquier versión reciente, para clonar el repositorio | — |
| Disco | 5 GB libres para imágenes, capas de compilación y el volumen de datos | 10 GB libres |
| Red | Acceso a Docker Hub y al registro de npm durante la primera compilación; las capas que ya estén en caché se reutilizan | — |
| Puertos | `8080` libre en `127.0.0.1` (se cambia con `WEB_PORT`). No se publica ningún otro puerto | — |

Antes de empezar, comprueba que Docker y Compose están disponibles y que el motor está en ejecución (en Windows y macOS, abre Docker Desktop y espera a que indique que está activo).

```sh
docker --version
docker compose version
docker info
```

Si `docker info` devuelve un error de conexión con el motor, Docker no está en ejecución. Para saber con cuánta memoria cuenta Docker, mira la línea `Total Memory` de esa misma salida.

## Ejecutar con Docker Compose

Con los requisitos anteriores cubiertos, clona y levanta el proyecto desde una terminal.

```sh
git clone https://github.com/ingebatista/AeroPlus-flight-booking.git
cd AeroPlus-flight-booking
docker compose up --build
```

Si vas a evaluar una rama o etiqueta específica, agrega `--branch <referencia>` a `git clone`. Compose lee `docker-compose.yml`, usa valores locales por defecto y funciona sin archivo `.env`. La primera compilación de las imágenes puede tardar varios minutos. Cuando arranque `web`, abre `http://localhost:8080`. La salud de la API está en `http://localhost:8080/api/health` y debe devolver `200` con `{"status":"ok"}`.

Compose arranca cuatro servicios en este orden: `db` (PostgreSQL 17), `migrate` (migraciones y datos iniciales con el rol propietario), `api` (NestJS con el rol `app`, que no puede ejecutar DDL) y `web` (Nginx con Angular, que reenvía `/api/` y `/ws/` a la API). Solo `web` se publica, en `127.0.0.1:8080`. El servicio `migrate` termina con código 0 al acabar: es lo esperado, no un fallo.

Para detener todo: `docker compose down`. Para borrar también los datos y volver a sembrar desde cero: `docker compose down -v`.

Si prefieres dejar la terminal libre, `docker compose up -d --build --wait --wait-timeout 300` levanta todo en segundo plano y espera a que los servicios estén saludables.

### Si algo falla

| Síntoma | Causa probable y solución |
| --- | --- |
| `failed to connect to the docker API` o `Cannot connect to the Docker daemon` | El motor de Docker no está en ejecución. Abre Docker Desktop (o inicia el servicio de Docker en Linux) y repite el comando. |
| `port is already allocated` o `address already in use` en el `8080` | Otro programa usa el puerto. Define `WEB_PORT=8081` (u otro libre) en un archivo `.env` o en el entorno y vuelve a ejecutar. |
| La compilación se corta con `exit code 137` o `Killed` | Suele indicar falta de memoria. Aumenta la memoria asignada a Docker (en Docker Desktop, *Settings → Resources*) y repite. |
| Error al descargar imágenes o paquetes | Sin acceso a Docker Hub o al registro de npm. Revisa la conexión, el proxy o la VPN de la red. |
| `no space left on device` | Falta espacio para Docker. Libera disco o ejecuta `docker system prune` (borra imágenes y cachés sin uso). |
| Cambiaste las contraseñas de la base y la API no conecta | PostgreSQL solo aplica las credenciales al inicializar el volumen. Ejecuta `docker compose down -v` y vuelve a levantar. |
| Pasaste del modo de desarrollo a Compose, o al revés, y hay conflictos | No mezcles los dos modos: ejecuta `docker compose down` antes de cambiar. |

### Probar la aplicación

1. **Buscar (HU1).** En `Buscar vuelos` elige una ruta con resultados. El catálogo de `BOG → MDE` tiene hasta tres salidas futuras por día UTC.
2. **Abrir dos clientes.** Abre la aplicación en dos pestañas independientes escribiendo la dirección en la barra. Así cada pestaña genera su propio identificador de cliente.
3. **Elegir asiento (HU2 y HU4).** Abre el mismo vuelo en las dos pestañas y selecciona un asiento en una de ellas. En la otra aparece como «Bloqueado» sin recargar. La vista «Ocupación» muestra los tres contadores del vuelo y se actualiza con los mismos eventos.
4. **Confirmar (HU3).** Entra al checkout, escribe nombre y apellido y usa una de las tarjetas que muestra la pantalla: `4242 4242 4242 4242` se aprueba y `4000 0000 0000 0002` se rechaza (el asiento sigue bloqueado).
5. **Consultar el boleto (HU3).** En `Consultar boleto`, con el código de reserva y el apellido.
6. **Ver el vencimiento (HU2 y HU4).** El bloqueo dura 300 segundos. Para verlo en 30, añade `HOLD_TTL_SECONDS=30` a un archivo `.env` y vuelve a ejecutar `docker compose up -d`. En el mapa, observa el aviso al vencer y cómo el asiento vuelve a estar disponible en la otra pestaña.
7. **Ver «Agotado» (HU1).** El vuelo `AP105` (`BOG → MDE`, 22:30 UTC) tiene seis asientos. Reserva los que queden disponibles en una pestaña y observa cómo el listado abierto en la otra pasa a «Agotado». Si esa salida ya pasó, elige el siguiente día UTC con datos.
8. **Administración (HU1).** En `/admin/acceso` entra con el token `AeroPlus-admin-dev` y marca otro vuelo como retrasado o cancelado. El cambio llega a las pestañas de búsqueda.

Las horas de salida y de llegada se muestran en UTC.

### Accesos y rutas de la interfaz

Con Compose, todas las rutas cuelgan de `http://localhost:8080`. En desarrollo local, de `http://localhost:4200`.

| Vista | Ruta | ¿Requiere código? |
| --- | --- | --- |
| Buscar vuelos (HU1) | `/` | No |
| Estado de vuelos | `/estado-de-vuelos` | No |
| Mapa de asientos de un vuelo (HU2) | `/vuelos/<id del vuelo>/asientos` | No |
| Checkout (HU3) | `/vuelos/<id del vuelo>/checkout` | No |
| **Dashboard de ocupación (HU4)** | `/vuelos/<id del vuelo>/ocupacion` | **No.** Es de lectura pública |
| Consultar boleto | `/boletos` | Código de reserva y apellido |
| **Administración** | `/admin/acceso` | **Sí: token de administración** |

- **Dashboard de ocupación.** No tiene código. Abre un vuelo desde la búsqueda y entra a su pestaña «Ocupación»: muestra los asientos disponibles, bloqueados y reservados, y se actualiza en tiempo real.
- **Administración (cambiar el estado de un vuelo).** Es la única vista protegida. En `/admin/acceso` escribe el token `AeroPlus-admin-dev`, que es el valor por defecto en desarrollo y en Compose. Se cambia con la variable `ADMIN_TOKEN` en un archivo `.env`; después, ejecuta `docker compose up -d` para aplicarlo. El token se conserva solo en memoria: al recargar la página hay que volver a introducirlo.
- **Código de reserva.** No es una credencial de acceso: es el boleto de 6 caracteres que se genera al confirmar una compra, y se usa junto con el apellido en `/boletos`.

### Variables opcionales

Todas tienen valor por defecto; la lista completa está en [.env.example](.env.example). Se pueden definir en un archivo `.env` o en el entorno del shell.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `WEB_PORT` | `8080` | Puerto del frontend en el host |
| `HOLD_TTL_SECONDS` | `300` | Duración del bloqueo de un asiento |
| `ADMIN_TOKEN` | `AeroPlus-admin-dev` | Token del área de administración |
| `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_HOLD`, `RATE_LIMIT_CONFIRM`, `RATE_LIMIT_ADMIN` | 120, 30, 10 y 30 | Solicitudes por minuto, por ruta y por IP |

Con `APP_NODE_ENV=production` la API se niega a arrancar si `ADMIN_TOKEN` es el valor de desarrollo.

Los datos iniciales cubren desde el día en que corre el *seed* hasta el último día del mes en curso, en UTC. Es una limitación conocida: el último día del mes, tras la salida de `AP105`, ya no hay un vuelo de demostración futuro. [docs/handoff/business-rules.md](docs/handoff/business-rules.md#catálogo-y-datos-iniciales) tiene el catálogo completo.

## Desarrollo local

Requiere Node.js 24 (desde 24.11, ver `.nvmrc`), npm 11 o superior y Docker para PostgreSQL y las pruebas. Desde esta carpeta, en este orden:

```sh
npm ci            # instalar dependencias (una vez)
npm run db:dev    # PostgreSQL en Docker, migraciones y datos iniciales
docker compose logs -f migrate
```

Cuando aparezca el resumen del seed, sal del seguimiento de logs con `Ctrl + C` si sigue abierto y comprueba que `docker compose ps -a migrate` muestre `Exited (0)`. Puedes arrancar la API y el frontend con el siguiente comando.

```sh
npm run dev       # API y frontend con recarga automática (se queda corriendo)
```

| Qué | Dirección |
| --- | --- |
| Aplicación (Angular) | `http://localhost:4200` (usa `localhost`, no `127.0.0.1`) |
| API (NestJS) | `http://localhost:3000/api/health`; el frontend la alcanza por proxy en `/api` |
| PostgreSQL | `localhost:5433` |

`Ctrl + C` detiene la API y el frontend; la base de datos sigue en Docker hasta ejecutar `docker compose down`. No mezcles este modo con `docker compose up --build`: ejecuta `docker compose down` antes de cambiar de uno a otro. `npm run build` compila los tres workspaces.

### Conexión a la base de datos (modo desarrollo)

| Dato | Valor |
| --- | --- |
| Host y puerto | `localhost:5433` (dentro de Docker es `5432`) |
| Base de datos | `flights` |

| Rol | Usuario | Contraseña | Uso |
| --- | --- | --- | --- |
| Propietario | `flights_owner` | `flights_owner_dev` | Administración y migraciones; recomendado para un cliente SQL |
| Aplicación | `app` | `app_dev` | El que usa la API: solo lee y escribe datos, sin DDL |

```text
postgres://flights_owner:flights_owner_dev@localhost:5433/flights
postgres://app:app_dev@localhost:5433/flights
```

Desde la terminal, con el `psql` del contenedor:

```sh
docker compose exec db psql -U flights_owner -d flights
```

- El puerto `5433` solo se publica en `127.0.0.1` y solo en modo desarrollo (`compose.dev.yaml`); con `docker compose up --build` la base no queda expuesta.
- Son credenciales de desarrollo local, no secretos. Se pueden cambiar con `DB_OWNER_PASSWORD` y `APP_DB_PASSWORD` en un `.env`, pero PostgreSQL solo las aplica al inicializar el volumen: tras cambiarlas, ejecuta `docker compose down -v`.

Para usar PostgreSQL fuera de Compose, prepara el rol propietario y el rol `app`, configura `DATABASE_URL` y `MIGRATION_DATABASE_URL` en `.env`, y ejecuta `npm run db:migrate` antes de `npm run dev`.

## Pruebas y calidad

```sh
npm test            # compila shared y ejecuta Jest (backend) y Vitest (frontend)
npm run lint        # ESLint
npm run format:check
npm run verify      # build, lint, format:check y test, en ese orden
```

Las pruebas del backend usan PostgreSQL 17 real, levantado con Testcontainers, y reproducen las carreras de concurrencia (por ejemplo, 50 bloqueos simultáneos sobre un asiento terminan en un éxito y 49 conflictos). Por eso requieren Docker activo. Se pueden correr por partes con `npm test -w backend` y `npm test -w frontend`. `npm run format` aplica Prettier.

## Estructura

```text
backend/
  apps/api/           API NestJS: flights, inventory, payments, admin y realtime
  apps/migrate/       Ejecutor de migraciones y datos iniciales (rol propietario)
  libs/domain/        Reglas y transiciones puras de vuelos, asientos y reservas
  libs/events/        Puerto EventBus y su adaptador en proceso
  libs/persistence/   Entidades, migraciones, seed y conexión a PostgreSQL
frontend/             Angular 21: búsqueda, mapa de asientos, checkout, ocupación y administración
packages/shared/      Contratos que cruzan el cable (DTOs, errores y eventos)
docker/db-init/       Creación del rol `app` de PostgreSQL
docs/                 Documentos de entrega (arquitectura y uso de IA)
  handoff/            Seguimiento, reglas, persistencia, contratos y evidencias
```

Todos los workspaces usan TypeScript 5.9 y un único `package-lock.json`.
