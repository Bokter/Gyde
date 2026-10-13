# Gyde

Plataforma SaaS que detecta y gestiona vulnerabilidades, conflictos de licencias y riesgos de compatibilidad en proyectos de videojuegos (Unity y Unreal Engine), apoyándose en bases de datos públicas de vulnerabilidades. Se ofrece con planes de suscripción cobrados con Stripe (modo test).

> **Estado:** MVP funcional de punta a punta. Probado en Docker con los siete servicios: inicio de sesión con GitHub, creación de API key, `gyde analyze` y reporte priorizado, con degradado y recuperación ante fallos. Evidencia de ejecución en [`docs/evidence/`](docs/evidence/humo-2026-10-12.txt). Lo que queda fuera del MVP está en [Alcance y límites](#alcance-y-límites).

## Qué hace

- **El análisis empieza en el entorno del cliente** (CLI y GitHub Action, que comenta el reporte en el pull request). El código fuente **nunca sale de ahí**: solo viajan nombres de dependencias, versiones y licencias.
- El backend cruza esa información con conocimiento normalizado de fuentes públicas (OSV en el MVP) y analiza vulnerabilidades y licencias de forma **determinística**.
- Con un plan de pago y la llave del propio estudio (BYOK, Anthropic o Google Gemini), un LLM explica y correlaciona los hallazgos.
- El resultado es un reporte **priorizado y explicable** (evidencia, impacto, recomendación).
- Si la IA falla o no está configurada, el reporte sale **degradado** con los mismos hallazgos: el sistema **degrada, no se cae**.

## Cómo ejecutarlo

Necesitas **Docker Desktop** y git (Node 24 y pnpm 11 solo para compilar el CLI). Clona en una **ruta corta y fuera de OneDrive** ([`infra/README.md`](infra/README.md) explica los problemas de rutas largas en Windows).

```bash
# 1. Una sola vez: crea .env con secretos locales aleatorios (no pisa uno existente)
node infra/scripts/bootstrap-env.mjs

# 2. Levanta los 7 servicios + PostgreSQL (la primera vez tarda varios minutos)
C="docker compose -p gyde --env-file .env -f infra/compose/compose.yaml"
$C up -d --build
$C ps                      # repítelo hasta que todos estén en "healthy" (unos minutos la primera vez)
```

- **Sin Node en tu máquina**, el paso 1 también se hace en un contenedor (elige tu terminal):

  ```bash
  # Linux, macOS o WSL
  docker run --rm -v "$PWD":/work -w /work node:24-alpine node infra/scripts/bootstrap-env.mjs
  # Git Bash (Windows): sin MSYS_NO_PATHCONV Git Bash convierte /work en una ruta de Windows y docker falla
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/work -w /work node:24-alpine node infra/scripts/bootstrap-env.mjs
  # PowerShell
  docker run --rm -v "${PWD}:/work" -w /work node:24-alpine node infra/scripts/bootstrap-env.mjs
  ```

- <a id="recursos-de-docker-desktop"></a>**Recursos de Docker Desktop:** para levantar el stack basta con lo básico; para la verificación completa (`--target check`) dale **al menos 4 CPUs y 6 GB de memoria**. Con el motor de Docker Desktop sobre Hyper-V se ajusta en *Settings → Resources*; con WSL 2 esos controles no aparecen y se fijan en `%UserProfile%\.wslconfig` (`[wsl2]` con `processors=4` y `memory=6GB`), seguido de `wsl --shutdown` y reiniciar Docker Desktop. Comprueba lo que ve Docker con `docker info --format 'CPUs={{.NCPU}} Mem={{.MemTotal}}'`.
- `--env-file .env` es obligatorio: el compose vive en `infra/compose` y sin él las variables de la raíz no llegan.
- **Iniciar sesión** (panel web en `http://localhost:3000`) requiere una OAuth App de GitHub propia: callback `http://localhost:3000/api/auth/callback/github`, con `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` en tu `.env`. Pasos en [`services/web/README.md`](services/web/README.md).
- **Para Stripe** (modo test): `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_PRICE_PRO`, `STRIPE_PRICE_STUDIO` y `STRIPE_WEBHOOK_SECRET` (con `stripe listen`). El sistema rechaza cualquier clave que no sea de prueba.

**Primer análisis**

```bash
# Crea una API key en http://localhost:3000/dashboard/api-keys (se muestra una sola vez),
# o, sin OAuth de GitHub, con los datos de desarrollo (ver más abajo)
pnpm install && pnpm build
export GYDE_API_KEY=<tu clave>
node apps/cli/dist/main.js analyze fixtures/projects/unity-sample
```

**Sin OAuth de GitHub: clave de desarrollo.** `seed:dev` crea un tenant de prueba y muestra una API key `gyde_test_…` una sola vez. Con Postgres arriba (`$C up -d postgres`) y desde la raíz del repo, en Git Bash o Linux/macOS/WSL:

```bash
# El .env usa el host `postgres` (válido solo dentro de compose); desde tu máquina es localhost:<POSTGRES_PORT>
export WEB_DATABASE_URL=$(grep '^WEB_DATABASE_URL=' .env | cut -d= -f2- | sed "s#@postgres:5432#@localhost:${POSTGRES_PORT:-5432}#")
pnpm --filter @gyde/web migrate        # debe terminar con "Migrations are up to date."
export GYDE_API_KEY=$(pnpm --filter @gyde/web seed:dev 2>/dev/null | grep -o 'gyde_test_[A-Za-z0-9_-]*')
```

Más detalles (idempotencia, cómo repetirlo) en [`services/web/README.md`](services/web/README.md#datos-de-desarrollo-seeddev).

Salida: hallazgos ordenados por severidad (código de salida `1` si hay alguno de severidad `high` o superior, ajustable con `--fail-on`; `0` en otro caso) y, con plan Pro y llave de IA, la explicación de cada uno; si la IA no está disponible, un aviso de reporte degradado.

**Comprobar la API con curl.** El gateway escucha en `http://localhost:4000`:

```bash
G=http://localhost:4000
curl -s -H "Authorization: Bearer $GYDE_API_KEY" $G/v1/auth/verify      # {"plan":"free","entitlements":{...}}
curl -s -o /dev/null -w "%{http_code}\n" $G/v1/auth/verify              # 401 sin clave (también con una inválida)
curl -s -o /dev/null -w "%{http_code}\n" $G/internal/analyses           # 404: /internal no se enruta por el gateway
```

El recorrido completo (crear un análisis, leer el reporte y el markdown) está en la sección 3 de [`docs/workflow/dia-de-integracion.md`](docs/workflow/dia-de-integracion.md).

**Prueba de humo de punta a punta** (levanta el stack, comprueba los resultados exactos y provoca fallos a propósito):

```bash
SMOKE_API_KEY=<tu clave> COMPOSE_PROJECT_NAME=gyde KEEP_STACK=1 bash infra/scripts/smoke-retrieval.sh
```

**Verificación completa (opcional).** No hace falta para ejecutar el sistema. Repite lo que hace el CI (formato, lint, tipos, pruebas y build) y tarda varios minutos:

```bash
docker build -f infra/docker/dev.Dockerfile --target check .
# o, con Node 24 y pnpm 11: pnpm install && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test --concurrency=2 && pnpm build
```

Necesita recursos: ver [Recursos de Docker Desktop](#recursos-de-docker-desktop) y [Problemas frecuentes](#problemas-frecuentes).

## Problemas frecuentes

- **Las pruebas fallan con `Test timed out in 5000ms`** (en `docker build ... --target check` o en `pnpm test`): la máquina va justa de CPU o memoria y las pruebas de los 16 paquetes compiten entre sí; el tiempo se va en cargar módulos, no en un error del código. Soluciones: dale más recursos a Docker Desktop (arriba), y con Node instalado ejecuta `pnpm test --concurrency=2` para correr solo dos paquetes a la vez. El `--target check` ya lo hace así.
- **`Bind for 0.0.0.0:5432 failed: port is already allocated`:** otro programa (otro proyecto de Gyde o un PostgreSQL instalado) usa el 5432. Elige otro puerto, quita el contenedor a medias (sin `-v`) y vuelve a subirlo: `export POSTGRES_PORT=5433`, `$C down`, `$C up -d`. Comprueba que la columna `PORTS` de `docker ps` muestre `0.0.0.0:5433->5432/tcp`; un contenedor que sale `healthy` pero solo con `5432/tcp` no tiene el puerto publicado, y `migrate` o `seed:dev` fallarán con `Migration failed:` sin más texto. Desde tu máquina usa `localhost:5433`.
- **`docker run ... -w /work` falla en Git Bash:** ver [`infra/README.md`](infra/README.md#problemas-conocidos-en-windows).

## Cómo está organizado

| Carpeta | Contenido |
|---|---|
| `apps/` | Lo que corre en la máquina del cliente: `cli`, `github-action` |
| `services/` | Un contenedor por carpeta: `gateway`, `web`, `normalization`, `retrieval`, `llm-analysis`, `reports`, `registry` |
| `packages/` | Librerías compartidas: `contracts` (esquemas zod), `analysis-engine`, `resilience`, `discovery`, `service-kit`, `design-tokens` |
| `tooling/` | Configuración compartida (TypeScript, ESLint con las reglas de capas, Prettier, Vitest) |
| `infra/` | Docker Compose, esquemas de PostgreSQL y scripts (incluida la prueba de humo) |
| `fixtures/` | Proyectos Unity/Unreal de ejemplo y respuestas grabadas, con resultados esperados |
| `docs/` | Arquitectura (con el modelo C4 en Structurizr), decisiones (ADR), diseño y flujo de trabajo |

Stack: TypeScript · pnpm + Turborepo · NestJS sobre Fastify (servicios) · Next.js (Servicio Web) · PostgreSQL (un schema y un rol por servicio) · Docker Compose · Vitest.

## Cómo se evidencia Clean Architecture

Cada servicio separa cuatro capas y la dependencia apunta siempre hacia adentro:

| Capa | Qué contiene | Ejemplo real |
|---|---|---|
| `domain/` | Entidades y reglas puras | `reports/src/domain/report/*` (reporte y decoradores) |
| `application/` | **Casos de uso** y **puertos** (interfaces) | `AuthenticateApiKey`, `SubmitAnalysis`, puerto `ApiKeyVerifier` |
| `infrastructure/` | **Adaptadores** (HTTP, base de datos, memoria) y **repositorios** | `WebApiKeyVerifier`, `MemoryAuthCache`, `HttpReportsClient` |
| `http/` | **Controladores** o handlers: reciben, validan (zod) y llaman a un caso de uso | `GatewayController`, `ApiKeyGuard` |

- La regla **la impone `pnpm lint`** ([`tooling/eslint/layer-boundaries.mjs`](tooling/eslint/layer-boundaries.mjs)): `domain/` y `application/` no pueden importar NestJS, Fastify, Drizzle, Stripe ni `infrastructure/`. Los casos de uso se construyen en el *composition root* (`app.module.ts`).
- El desacoplamiento se nota en que **se cambia un adaptador sin tocar el caso de uso**: Reports usa `PostgresReportRepository` (o `InMemoryReportRepository` si no hay `REPORTS_DATABASE_URL`) detrás del puerto `ReportRepository`; el Servicio Web tiene un adaptador del puerto de prueba de conexión por proveedor de IA y uno sin red; llm-analysis, uno del puerto `FindingAnalyzer` por proveedor.
- Diagramas de contexto, contenedores y componentes, con el archivo de cada pieza: [Modelo C4](docs/architecture/05-modelo-c4.md), exportado de una única fuente en Structurizr DSL ([`workspace.dsl`](docs/architecture/c4/workspace.dsl)).

## Patrones implementados

| Patrón | Tipo | Dónde | Evidencia de que funciona |
|---|---|---|---|
| Circuit Breaker | Arquitectónico | `packages/resilience`, usado por `ResilientHttpClient` | Con Reports detenido el gateway responde `503 upstream_unavailable` y se recupera (humo) |
| Service Discovery | Arquitectónico | `services/registry`, `packages/discovery` | Registro, latido y resolución; respaldo a `*_URL` si el registry cae |
| Abstract Factory | Diseño | `packages/analysis-engine/src/toolchain/` | Unity (C# + OSV) o Unreal (C++ + NVD) según `detectGameEngine` |
| Template Method (pipeline) | Diseño | `packages/analysis-engine/src/pipeline/` | `runAnalysis` fija el orden; una prueba impide sobrescribirlo |
| Template Method (analizadores) | Diseño | `services/retrieval/src/domain/analyzers/` | `BaseAnalyzer.analyze` fija select → match → toFinding → prioritize |
| Decorator | Diseño | `services/reports/src/domain/report/` | Capas `basic, license-compliance, ai-enrichment, severity-score` según el plan (humo) |

Detalle y cómo se prueba cada uno: [Patrones](docs/architecture/03-patrones.md).

## Decisiones principales

| Decisión | Por qué | ADR |
|---|---|---|
| Monorepo TypeScript con pnpm y Turborepo | Un solo lugar para contratos, librerías y servicios | [0001](docs/adr/0001-monorepo-typescript-con-pnpm-y-turborepo.md) |
| Arquitectura limpia con reglas de capas impuestas por lint | Que la estructura no dependa de la disciplina | [0002](docs/adr/0002-arquitectura-limpia-y-reglas-de-capas.md) |
| Contratos primero con zod y privacidad estricta | El código del cliente no puede viajar por construcción | [0003](docs/adr/0003-contratos-primero-con-zod-y-privacidad-estricta.md) |
| El backend orquesta el análisis | El cliente envía una sola petición | [0004](docs/adr/0004-el-backend-orquesta-el-analisis.md) |
| Discovery en el registry, con respaldo estático | Nadie hardcodea direcciones | [0005](docs/adr/0005-discovery-en-el-gateway-y-registry-como-servicio.md) |
| Llaves de LLM por estudio (BYOK), cifradas con AES-256-GCM | El estudio controla su costo y su llave | [0007](docs/adr/0007-llaves-llm-por-estudio-byok.md) |
| PostgreSQL con un schema por servicio | Cada servicio es dueño de sus datos | [0009](docs/adr/0009-postgresql-un-schema-por-servicio.md) |
| NestJS sobre Fastify en los servicios | Estructura uniforme sin acoplar el dominio | [0011](docs/adr/0011-nestjs-como-framework-de-los-servicios.md) |

Lista completa: [ADR](docs/adr/README.md).

## Manejo de errores

- **Respuestas controladas:** todo error sale con el sobre estándar `ApiError` (código y mensaje, sin cuerpos de otros servicios ni trazas); un fallo de un vecino es `503 upstream_unavailable`, nunca un cuelgue.
- **Degradado:** sin IA el reporte sale `ready` y `degraded` con el motivo (`llm-unavailable`, `llm-not-configured`, `llm-error`).
- **Reintentos y plazos:** Reports tiene temporizadores para cada etapa; Stripe reintenta el webhook (idempotente con `stripe_events`).
- **Logs** estructurados con `x-request-id`; los secretos se censuran por nombre de campo y las llaves nunca se registran.

## Alcance y límites

Fuera del MVP o en esqueleto, de forma declarada: `CompatibilityAnalyzer`, fuentes NVD y GHSA, y los contadores de plan y tasa del gateway (en memoria, se pierden al reiniciar). La GitHub Action está implementada y probada con un gateway falso, pero un runner de GitHub no alcanza un gateway local, así que no se demuestra en vivo. Un análisis que llevaba poco tiempo en curso cuando Reports se reinició puede quedar sin cerrar si su resultado no llega (límite del barrido de arranque, ver [`services/reports/README.md`](services/reports/README.md)). La caché de verificación de claves dura 60 s, así que una clave revocada puede seguir válida ese tiempo.

## Documentación

| | |
|---|---|
| [Arquitectura](docs/architecture/00-vision-general.md) | Contenedores, flujos, patrones, datos y seguridad |
| [Modelo C4](docs/architecture/05-modelo-c4.md) | Contexto, contenedores y componentes (Structurizr, única fuente de los diagramas) |
| [Decisiones (ADR)](docs/adr/README.md) | Por qué se decidió cada cosa |
| [Evidencia de ejecución](docs/evidence/humo-2026-10-12.txt) | Salida de la prueba de humo de punta a punta |
| [Día de integración](docs/workflow/dia-de-integracion.md) | Lista de verificación y guion de la demo |
| [Sistema de diseño](docs/design/sistema-de-diseno.md) | Fuente, paleta, tokens y accesibilidad |
| [Plan del equipo](docs/tasks/00-resumen.md) | Reparto en 4 áreas y briefs |
| [Índice completo](docs/README.md) | Todo lo demás |

## Cómo contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md): ramas, commits (Conventional Commits), pull requests y reglas de arquitectura. La configuración de GitHub (protección de `main`, merges, seguridad) está en [`docs/workflow/configuracion-github.md`](docs/workflow/configuracion-github.md). Para reportar una vulnerabilidad: [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE)
