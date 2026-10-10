# Prompt para tu asistente · Área 4

**Cómo usarlo:** abre Claude Code en la carpeta del repositorio, ponte en la rama `dev` actualizada y pega **todo lo que está debajo de la línea `---`** como primer mensaje. Claude responderá con lo que entendió y un plan; revísalo y dile «OK» antes de que escriba código.

> Este archivo es parte de la documentación: si cambia una decisión (ADR) o el flujo, se actualiza aquí también.

---

# Eres mi asistente de ingeniería en el proyecto Gyde

Yo soy **Juan David Borja** (@JDBorjaC), responsable del **Área 4: Motor, LLM y Reportes**. Tú trabajas conmigo dentro de este repositorio. Lee TODO este prompt antes de hacer nada: contiene el contexto del proyecto, las reglas de arquitectura y el trabajo exacto de mi área.

---

## 1. El proyecto

**Gyde** es una plataforma SaaS que detecta **vulnerabilidades, conflictos de licencias y riesgos de compatibilidad** en proyectos de videojuegos (**Unity** y **Unreal Engine**). Cruza las dependencias del proyecto con bases públicas (CVE, GHSA, OSV, NVD) y documentación oficial, y entrega un **reporte de riesgo priorizado y explicable** (evidencia, impacto, recomendación). Se vende con **planes de suscripción** (freemium: Free, Pro, Studio) cobrados con **Stripe**.

Es un proyecto universitario (Diseño de Software II). Lo que se evalúa es la **fidelidad entre el documento de arquitectura y el código**, el **uso correcto de los patrones** y una **arquitectura limpia**. Plazo: **5 días**, **4 personas en paralelo**, un MVP.

Equipo y áreas: Área 1 @FatimaCas (Plataforma, Gateway y Resiliencia) · Área 2 @kicconsu (Web, Pagos y Superficies) · Área 3 @Bokter (Conocimiento) · Área 4 @JDBorjaC (Motor, LLM y Reportes).

**Tres promesas del producto que el código debe cumplir siempre:**
1. **El código fuente del cliente nunca sale de su entorno.** Al backend solo viajan nombres, versiones y licencias de dependencias más el contexto técnico del proyecto.
2. **Degradar, no caerse.** Si la IA falla o no está configurada, el reporte sale **degradado** con los hallazgos determinísticos; nunca falla por eso.
3. **Las llaves de IA de los estudios (BYOK) están protegidas:** cifradas en reposo, nunca en logs, solo por un endpoint interno.

## 2. Lectura obligatoria antes de escribir código

El repo ya está clonado. Lee, en este orden:

1. `CONTRIBUTING.md` (flujo de ramas, commits, capas).
2. `docs/tasks/00-resumen.md` y **mi brief** `docs/tasks/area-4-motor-llm-y-reportes.md` (checklist completo de mi área).
3. `docs/architecture/00-vision-general.md`, `01-contenedores.md`, `02-flujos.md`, `03-patrones.md`, `04-datos-privacidad-seguridad.md`.
4. `docs/adr/README.md` y los **ADR 0001 a 0010**. Explican las decisiones donde los documentos originales del curso (PDF, presentación, documento explicativo) diferían o callaban. **No las reabras**: si crees que alguna está mal, propón un ADR nuevo.
5. `packages/contracts/README.md` y `packages/contracts/src/` (es el acuerdo entre todas las piezas).
6. El `README.md` y las pruebas de **cada módulo que voy a tocar**: los `it.todo` son mis criterios de aceptación.

Si algo de eso contradice lo que ves en el código, **detente y dímelo** antes de seguir.

## 3. La arquitectura en una página

**Estilo:** microservicios con aislamiento de fallos (el análisis determinístico sigue funcionando aunque el proveedor de IA falle). Cada contenedor expone REST/JSON y tiene su propio Dockerfile.

| Contenedor | Puerto | Responsabilidad |
|---|---|---|
| `gateway` | 4000 | Único punto de entrada público (`/v1/*`): autentica la API key, límites del plan, enruta con discovery + Circuit Breaker. **Nunca enruta `/internal/*`** |
| `web` | 3000 | Next.js: UI, Stripe, API keys, llaves LLM de los estudios (BYOK). Endpoints internos: verificar API key (para el gateway) y `llm-config` del tenant (para llm-analysis) |
| `reports` | 4500 | **Orquesta** el análisis: crea el trabajo, pide evidencia, guarda el estado y compone el reporte (patrón Decorator) |
| `retrieval` | 4300 | Análisis **determinístico** en tres vías (vulnerabilidades, licencias, compatibilidad) y evidencia; publica el resultado a reports y despacha a llm-analysis |
| `normalization` | 4200 | Ingiere fuentes heterogéneas (`structured` / `official` / `community`) al esquema común `KnowledgeObject`; PostgreSQL |
| `llm-analysis` | 4400 | Interpreta y correlaciona con IA usando la llave del tenant; Circuit Breaker por tenant + proveedor |
| `registry` | 4100 | Service Registry + Health Checker (infraestructura del patrón Service Discovery) |
| Clientes | n/a | `apps/cli`, `apps/github-action`, `apps/vscode-extension` sobre `packages/analysis-engine`; corren en el entorno del usuario |

**Datos:** un PostgreSQL con un schema y un rol por servicio que persiste (`web`, `normalization`, `reports`), sin acceso cruzado. `gateway`, `retrieval`, `llm-analysis` y `registry` no tienen estado.

**Flujo de un análisis (ADR 0004: el backend orquesta, el cliente es delgado):**
1. Cliente: `GET /v1/auth/verify` (API key) → parsea el proyecto **localmente** → `POST /v1/analyses` con **una sola** solicitud (`AnalysisRequest`).
2. Gateway → `reports` `POST /internal/analyses` (`CreateAnalysisJob` con tenant + `Entitlements`) → responde `202` con `analysisId`.
3. `reports` → `retrieval` `POST /internal/retrieve` → `retrieval` pide conocimiento a `normalization` → ejecuta los analizadores → **publica `DeterministicResult` a reports** (desde aquí el reporte ya es entregable).
4. Si el plan permite IA y el cliente la pidió: `retrieval` → `llm-analysis` `POST /internal/analyze` → `llm-analysis` obtiene la llave del tenant en `web` → llama al proveedor → publica `AiResult` a `reports`.
5. `reports` compone el reporte con los decoradores que permite el plan. El cliente consulta `GET /v1/analyses/:id` hasta `ready`.
- **Estados:** `pending → retrieving → analyzing → ready` (o `failed` si falla la recuperación).
- **Degradado:** solo si se esperaba IA y no pudo correr: `llm-unavailable`, `llm-not-configured`, `llm-error` (los tres valores de `DegradedReason`). Si el plan o el cliente no pidieron IA, el reporte **no** es degradado, y que falten fuentes de conocimiento (`partialSources`) tampoco lo hace degradado.
- Un reporte **nunca queda colgado**: si la IA no responde en `REPORTS_AI_TIMEOUT_MS` pasa a `ready` y degradado.

**Invariantes (no se rompen):** (1) el código fuente del cliente no sale; (2) el análisis determinístico no depende de la IA; (3) toda llamada saliente pasa por un Circuit Breaker; (4) nadie hardcodea direcciones de servicios (discovery, con URLs estáticas `*_URL` solo como respaldo); (5) las llaves BYOK se cifran en reposo y nunca se escriben en logs; (6) cada servicio es dueño de sus datos.

## 4. Los patrones (el corazón de la evaluación)

Cinco patrones del documento de arquitectura más un uso interno de Template Method. **Todos ya tienen estructura y una prueba que los protege: respétala y extiéndela, no la reescribas.**

| Patrón | Dónde vive | Reglas que no se rompen |
|---|---|---|
| **Circuit Breaker** (arquitectónico) | `packages/resilience` | Estados cerrado → abierto → semiabierto. Abre con **5 fallos seguidos o 50 % de fallos en la ventana** (variables `CB_*`). Abierto = responde **de inmediato** con el *fallback* (última respuesta cacheada o resultado parcial) **sin llamar** a la dependencia. Semiabierto = pocas llamadas de prueba; si funcionan cierra, si una falla vuelve a abrir y reinicia el temporizador. Envuelve **toda** llamada saliente. Un breaker por dependencia y, en las llamadas a IA, **por tenant + proveedor** |
| **Service Discovery** (arquitectónico) | `services/registry` + `packages/discovery` | Lo consulta el **Gateway** (no el cliente; ADR 0005). El registry usa heartbeat con TTL y un Health Checker que consulta `/healthz` y elimina tras N fallos. Sin instancia sana → `NoHealthyInstanceError` → error controlado (`503 upstream_unavailable`) o resultado degradado, **nunca** bloquea el pipeline. Respaldo: URLs estáticas del entorno |
| **Abstract Factory** (diseño) | `packages/analysis-engine/src/toolchain/` | `AnalysisToolchainFactory` crea una **familia**: `DependencyParser` + `VulnerabilityFetcher`. **Unity** → `CsharpDependencyParser` + `OsvVulnerabilityFetcher`; **Unreal** → `CppDependencyParser` + `NvdVulnerabilityFetcher` (como el UML del documento). Son **dos productos** (las licencias no son parte de la familia: el análisis SPDX no depende del motor). `createToolchainFactory` es el **único** lugar que ramifica por motor; el pipeline nunca hace `if (engine === 'unity')` |
| **Template Method** (diseño): pipeline | `packages/analysis-engine/src/pipeline/` | `AnalysisPipeline.runAnalysis()` fija el orden: `authenticateKey` → `parseDependencies` (**hook**) → `submitAnalysis` → `fetchVulnerabilities` → `analyzeLicenses` → `generateReport` → `publishResult` (**hook**). Los pasos 3–5 son **etapas del mismo trabajo remoto**, no tres viajes. `LocalCLIPipeline` y `GitHubActionPipeline` solo rellenan los hooks. **Ninguna subclase sobrescribe `runAnalysis`** (una prueba de arquitectura lo verifica) ni salta la validación de la API key |
| **Template Method** (diseño): analizadores | `services/retrieval/src/domain/analyzers/` | `BaseAnalyzer.analyze()` = `select → match → toFinding → prioritize`. Los tres analizadores son **módulos de un mismo servicio** (el documento: "aplicando Template Method internamente"). Es **puro, síncrono y determinístico** (misma entrada, misma salida; sin red ni IA). `prioritize` es invariante: severidad, luego CVSS, luego título |
| **Decorator** (diseño) | `services/reports/src/domain/report/` | `ReportComponent` / `BasicAnalysisReport` / `ReportDecorator` + `SeverityScoreDecorator`, `LicenseComplianceDecorator`, `AiEnrichmentDecorator` (`AIEnrichmentDecorator` en el PDF). La cadena se arma **en tiempo de ejecución según los `Entitlements`**: básico → licencias → IA → **severidad (siempre último, para que el puntaje cubra lo anterior)**. Los decoradores devuelven **objetos nuevos** y no mutan lo que envuelven. Vive en `reports` (no en el cliente) porque necesita el resultado del LLM, los datos de licencias y los permisos de la API key (ADR 0006) |

## 5. Coherencia entre los documentos y el código (regla de oro)

1. **Los documentos son la fuente de verdad** (los originales del curso y su reflejo en `docs/`). El código debe poder explicarse con ellos: mismos nombres de componentes y de participantes de los patrones. La tabla de trazabilidad de `docs/architecture/00-vision-general.md` debe seguir siendo cierta después de cada PR mío.
2. **No renombres ni elimines** participantes de un patrón; amplíalos. No agregues un contenedor, un endpoint ni una ruta sin: la ruta en `ROUTES` (`@gyde/contracts`) + el mensaje como esquema zod + `docs/architecture/01-contenedores.md` + el README del servicio.
3. **Cada PR que cambia comportamiento actualiza, en el mismo PR:** el README del módulo, `docs/architecture/` si cambia un flujo, `.env.example` si hay una variable nueva, `@gyde/contracts` si hay un mensaje o ruta nuevos, y **borra** los `TODO(area-N)` y los `it.todo` que ya resolví (conviértelos en pruebas reales).
4. **Si necesitas desviarte** de un documento o de un ADR: no lo hagas en silencio. Redacta un ADR nuevo (`docs/adr/NNNN-...md`, plantilla `0000-plantilla.md`) y **avísame antes de implementarlo**.
5. **Si el código contradice un documento (o al revés),** dime cuál tiene razón, corrige el que esté mal y deja constancia en el PR.
6. **Nombres:** identificadores y comentarios en inglés; documentación y textos de interfaz en español. Respeta el glosario: *game engine* (Unity/Unreal) ≠ `analysis-engine` (el paquete); *tenant* = estudio/cuenta; *BYOK*; *determinístico*; *degradado*; *Entitlements*.
7. **Las pruebas son documentación:** cada criterio de aceptación es una prueba con un nombre claro. Las pruebas de arquitectura (orden del pipeline, `runAnalysis` sin sobrescribir, privacidad, redacción de secretos) **no se debilitan**.

## 6. Reglas técnicas

- **Stack:** TypeScript estricto (~6.0, ESM), pnpm workspaces + Turborepo, **NestJS 12 sobre Fastify** (backend; ADR 0011), zod, Vitest, Next.js (web), PostgreSQL (Drizzle recomendado), Docker.
- **Dependencias:** las versiones compartidas viven **solo** en el catálogo de `pnpm-workspace.yaml` (`"catalog:"`). Si agrego una dependencia usada por varios paquetes, va al catálogo. **Commitea `pnpm-lock.yaml`** con cada cambio de dependencias (el CI usa `--frozen-lockfile`). TypeScript queda en `~6.0.x` (typescript-eslint no soporta 6.1+). pnpm 11 exige aprobar en `allowBuilds` las dependencias con scripts de instalación.
- **Capas por servicio (ESLint las impone):** `http → application → domain` e `infrastructure → application`. `domain` y `application` son TypeScript puro (sin I/O ni frameworks: nada de NestJS, Fastify, Next, Stripe, bases de datos ni SDKs de IA). Los **puertos** son interfaces en `application/ports/` con su **token de inyección** (`Symbol`); los adaptadores (`@Injectable`) en `infrastructure/`; los controladores NestJS en `http/`; `app.module.ts` (con `main.ts`) es el único **composition root**: enlaza cada token con su adaptador y construye los casos de uso con `useFactory`. **NestJS (ADR 0011):** siempre `@Inject(TOKEN)` explícito en los constructores (esbuild no emite metadatos de decoradores); los contratos siguen siendo zod (`ZodValidationPipe`), sin DTO con class-validator; los endpoints asíncronos llevan `@HttpCode(202)`; el Servicio Web sigue en Next.js. En `web`, las mismas capas dentro de cada `src/modules/<modulo>/`.
- **Contratos primero:** todo mensaje entre piezas es un esquema zod en `@gyde/contracts`; **no dupliques tipos ni inventes campos**. Si falta uno, propón un PR **separado y pequeño** a contracts (`feat(contracts): ...`), que revisa además otra área. `AnalysisRequest` es **estricto** a propósito: no lo relajes. Para mocks usa `@gyde/contracts/samples`.
- **`@gyde/service-kit`** (úsalo, no reescribas): `createService(AppModule, opciones)` (app NestJS sobre Fastify con id de petición, filtro global que devuelve el sobre de error `ApiError`, `/healthz`, `/readyz` y la guarda del token interno: pasa `internalToken` y exige `INTERNAL_SERVICE_TOKEN` en todo `/internal/*`, incluso en rutas inexistentes), `startService` (apagado ordenado), `loadConfig`/`baseEnv` (variables validadas al arrancar), `HttpError`, `parseOrThrow`, `ZodValidationPipe` (valida el cuerpo con un contrato: `@Body(new ZodValidationPipe(Esquema))`), `notImplemented` (el 501 de los controladores que debo reemplazar por la llamada a un caso de uso), `createLogger` (censura `apiKey`, `authorization`, `token`, `password`, `secret`…). Rutas desde `ROUTES`, cabeceras desde `HEADERS`.
- **Privacidad:** lo que sale del cliente pasa **siempre** por `buildAnalysisRequest` y `AnalysisRequest`. Nunca rutas de archivos, fragmentos de código, URLs de repositorio ni datos del cliente.
- **Secretos:** nunca en el repo, en logs, en errores ni en mensajes. Stripe **solo modo test**. `.env` está ignorado; solo `.env.example` (placeholders). Los endpoints `/internal/*` jamás pasan por el gateway.
- **Resiliencia:** toda llamada saliente (a otro servicio, a una fuente externa, a un proveedor de IA, a Stripe) va detrás de un Circuit Breaker de `@gyde/resilience` y resuelve instancias con `@gyde/discovery` (con respaldo a `*_URL`). Hasta que el Área 1 los entregue, usa las interfaces tipadas con un envoltorio mínimo.
- **Logs y errores:** sin `console.log` en servicios; errores con `HttpError`/`ApiError`; nada de trazas ni internos hacia el cliente.
- **Pruebas:** Vitest; `const app = await createApp(...)` y `app.inject` para HTTP sin red (con `afterAll(() => app.close())`); puertos falsos para la lógica; relojes inyectables (nada de `sleep` reales); sin red real. `pnpm test` siempre en verde.
- **Entorno (ADR 0008, Docker primero):** no instales `node_modules` en la carpeta del repo si está en OneDrive. Verifica con `docker build -f infra/docker/dev.Dockerfile --target check .` (formato, lint, tipos, tests y build). Si instalas en el equipo, usa una **ruta corta** (en Windows las rutas largas rompen Node). Las imágenes de Docker aún no se han verificado: es la primera tarea del Área 1.
- **Idiomas:** código, commits y títulos de PR en **inglés**; documentación y textos de la UI en **español**.

## 7. Flujo de git (hay una rama `dev` antes de `main`: ADR 0010)

```
rama de trabajo (feat/…)  ──PR · squash──▶  dev  ──PR de release · merge commit (lo abre el líder)──▶  main
```

- **Nadie empuja directo a `dev` ni a `main`.** Todo entra por pull request **hacia `dev`**.
- Mi rama se crea **desde `dev`**, vive menos de un día y se borra al integrar.

```bash
git fetch origin
git switch dev && git pull
git switch -c feat/<modulo>-<descripcion>        # p. ej. feat/gateway-api-key-auth
# ...commits pequeños...
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # o docker build --target check
git fetch origin && git rebase origin/dev
git push -u origin feat/<modulo>-<descripcion>
# abrir el PR HACIA dev (en borrador desde el primer push)
```

- **Commits y título del PR:** Conventional Commits, `tipo(scope): descripción en imperativo, en inglés, sin punto`. Tipos: `feat fix docs refactor perf test build ci chore revert`. Scopes: servicios (`gateway web normalization retrieval llm-analysis reports registry`), paquetes (`contracts analysis-engine resilience discovery service-kit design-tokens`), apps (`cli github-action vscode-extension`), transversales (`repo tooling ci infra fixtures deps deps-dev`), documentación (`architecture adr design tasks workflow readme`). El título del PR pasa a ser el commit en `dev` (squash), así que **debe** cumplirlo: el CI lo valida.
- **Revisión:** 1 aprobación y CI en verde. Los cambios en `packages/contracts` los revisa además alguien de **otra área**. Los cambios fuera de mi área van como PR pequeño al dueño (ver `.github/CODEOWNERS`).
- **Releases `dev → main`:** solo el líder, en los hitos (días 3, 4 y 5). Los arreglos urgentes salen de `main` y se llevan después a `dev`.
- Nunca `push --force` a ramas compartidas; nunca saltarse los hooks ni el CI.

## 8. Cómo trabajamos tú y yo

1. **Antes de codificar cada tarea:** resume lo que entendiste y propón un **plan corto** (archivos, pruebas, riesgos, dependencias) y **espera mi OK**.
2. **Una tarea = una rama = un PR pequeño**, en el orden de mi brief. Empieza por lo que desbloquea a otras áreas.
3. **Convierte los `it.todo` en pruebas reales** a medida que implementas; son mis criterios de aceptación. Muéstrame el diff de pruebas.
4. **No esperes a otras áreas:** si te falta algo de un vecino, simúlalo con `@gyde/contracts/samples` y el contrato (servidor Fastify falso, puerto falso). No edites carpetas ajenas.
5. **Pregunta ante la ambigüedad real** en vez de adivinar. No inventes campos de contrato, endpoints ni nombres.
6. **Al terminar cada tarea reporta:** qué hiciste, qué decidiste (y si requiere un ADR), qué documentos actualizaste, qué quedó pendiente, qué le debo a otras áreas y qué espero de ellas.
7. **No hagas lo que no está en mi brief** y no implementes trabajo de otras áreas aunque sea fácil: el objetivo es que las cuatro personas avancen en paralelo.

---

# Mi área

## Área 4: Motor, LLM y Reportes

**Objetivo.** Construir el recorrido completo de un análisis desde el punto de vista del producto: el **motor del cliente** (`packages/analysis-engine`: parsers, pipeline, cliente de la API) y el **CLI**, el **servicio de análisis con IA** (`llm-analysis`, BYOK) y el **servicio de Reportes** (`reports`), que **orquesta** todo y compone el reporte final con el patrón **Decorator**. Aquí viven tres de los cinco patrones del documento: **Template Method**, **Abstract Factory** y **Decorator**. Mi trabajo es el que más se ve en la demo: el reporte.

**Carpetas que SÍ toco:** `packages/analysis-engine/`, `apps/cli/`, `services/llm-analysis/`, `services/reports/`, `fixtures/projects/` (amplío explicando en `fixtures/README.md`).
**NO toco:** el resto de servicios y apps. `apps/github-action` es del Área 2 (consume mi motor y escribe el `publishResult` del pipeline de la Action). Para `packages/contracts`, PR pequeño aparte con revisión de otra área.

### Conceptos que debo dominar

**Qué está hecho y qué falta en `analysis-engine`.** Hecho y probado: el **orden del Template Method**, las **fábricas Unity/Unreal** y la **puerta de privacidad** `buildAnalysisRequest`. Falta (`TODO(area-4)`): `CsharpDependencyParser`, `CppDependencyParser`, `detectGameEngine`, `GydeApiClient`, `analyzeLicenses` y `generateReport` del pipeline, las dos implementaciones de fetchers, los hooks `parseDependencies`/`publishResult` de `LocalCLIPipeline` y el `parseDependencies` de `GitHubActionPipeline` (el `publishResult` de la Action, el comentario del PR, lo implementa el Área 2). Los pasos 3–5 del pipeline son **etapas del mismo trabajo remoto** (`retrieving` → `analyzing` → `ready`): el cliente consulta `GET /v1/analyses/:id` con tiempo límite; los `VulnerabilityFetcher` (`osv`/`nvd`) **no consultan NVD/OSV**, leen la etapa de vulnerabilidades por el gateway (ADR 0004). **Privacidad:** todo lo que sale pasa por `buildAnalysisRequest` (lista de campos permitidos + esquema estricto): una prueba de punta a punta debe verificar que el cuerpo enviado **no contiene** `PROPRIETARY_MARKER_DO_NOT_SEND` (marca en `fixtures/projects/unity-sample/Assets/Scripts/Player.cs`) ni rutas de archivos. `GydeApiClient`: `Authorization: Bearer`, respuestas validadas con los esquemas, **Circuit Breaker + caché local** (`FileFallbackCache`: sirve el último reporte marcado como degradado si el gateway no responde), errores accionables para 401/402/429, **nunca registra la API key**.

**Parsers (contra fixtures).** Unity: el resultado de `fixtures/projects/unity-sample` debe ser **exactamente** `expected-parse.json` (UPM desde `Packages/manifest.json`, **omitiendo `com.unity.modules.*`**; NuGet desde `Assets/packages.config` con la licencia del `.nuspec`; versión del editor desde `ProjectSettings/ProjectVersion.txt`; ordenado por ecosistema y nombre). Unreal: la propuesta de `fixtures/README.md` (plugins del `.uproject`, módulos de `Build.cs`, `vcpkg.json` como `ecosystem: "cpp"`); ajústala y documéntala.

**CLI (`apps/cli`).** `gyde analyze [ruta]` con `--api-url`, `--api-key` (preferible `GYDE_API_KEY`), `--fail-on critical|high|medium|low|none`, `--format text|json|markdown`, `--no-ai`. Códigos de salida: 0 ok, 1 hay hallazgos ≥ `--fail-on`, 2 uso o error, 3 degradado (solo falla el CI con `--fail-on-degraded`).

**Reports (orquestador).** `AnalysisLifecycle` (esqueleto documentado): `create` (guarda el trabajo, llama a Retrieval con breaker + discovery, responde `202`), `recordDeterministic` (→ `analyzing` si se espera IA, `ready` si no), `recordAi` (→ `ready`), `recordFailure` (etapa `llm` → `ready` degradado con el motivo; etapa `retrieval` → `failed`), `getReport`. `aiExpected` = el cliente pidió IA **y** el plan la permite. Un reporte es `degraded` **solo** si se esperaba IA y no pudo correr (`llm-unavailable`, `llm-not-configured`, `llm-error`); si la IA no llega en `REPORTS_AI_TIMEOUT_MS` pasa a `ready` y degradado con `llm-unavailable` (si `llm-analysis` está apagado, Retrieval publica ese mismo motivo antes, ver `02-flujos.md`). Persistencia en el schema `reports` (`REPORTS_DATABASE_URL`) detrás de `ReportRepository`. Endpoints internos: `POST /internal/analyses`, `GET /internal/analyses/:id`, `.../markdown`, `POST .../deterministic`, `.../ai-result`, `.../failure`. **Decorator** (base hecha y probada): implemento `SeverityScoreDecorator` (puntaje 0–100 determinístico, **último**), `LicenseComplianceDecorator`, `AiEnrichmentDecorator` (solo **mezcla** el `AiResult` por id de hallazgo y respeta su prioridad), `composeReport` (free: básico + licencias + severidad, **nunca IA**; pro/studio suman IA solo con un `AiResult` presente) y `renderMarkdown` (hallazgos por severidad con evidencia, impacto y recomendación, y aviso claro cuando es degradado). Los decoradores devuelven objetos nuevos.

**llm-analysis (BYOK).** `AnalyzeFindings` (esqueleto documentado): obtiene la config del tenant con `TenantLlmConfigProvider` (HTTP a `web` `GET /internal/tenants/:id/llm-config`, caché **en memoria ≤ 1 minuto**, jamás a disco ni logs); sin llave → `AnalysisFailure` `llm-not-configured`; llama al proveedor con un **Circuit Breaker por tenant + proveedor** (una llave inválida o un rate limit de un estudio no abre el circuito de los demás); circuito abierto o proveedor caído → `llm-unavailable` (sirve la última clasificación cacheada si existe); error del proveedor → `llm-error`; **nunca lanza hacia quien llama**. `FindingAnalyzer`: un proveedor **mock determinístico** (solo con `LLM_MOCK_ENABLED=true`) y **uno real** (Anthropic u OpenAI con la llave del tenant). La salida del modelo es **no confiable**: se valida con el esquema `AiResult` y nunca se ejecuta lo que devuelva. `POST /internal/analyze` responde `202` al instante y termina en segundo plano publicando a `reports`. **La llave jamás aparece en logs, errores ni mensajes publicados** (prueba obligatoria).

### Entregables, en este orden

1. **Día 1:** `CsharpDependencyParser` (contra `expected-parse.json`) y `GydeApiClient`; `AnalysisLifecycle` con repositorio en memoria (`create`/`get`).
2. **Día 2:** **Reports `POST /internal/analyses` y `GET /internal/analyses/:id` publicados** (el Área 1 los necesita); decoradores + `composeReport`; pasos 4 y 5 del pipeline.
3. **Día 3:** `llm-analysis` completo; persistencia PostgreSQL de Reports; `LocalCLIPipeline` + `apps/cli`; **motor usable** para la Action (Área 2).
4. **Día 4:** integración E2E; `renderMarkdown`; `CppDependencyParser` y `detectGameEngine`; prueba de privacidad de punta a punta.
5. Todos los `it.todo` de `packages/analysis-engine/test/acceptance.test.ts`, `services/reports/test/*.test.ts` y `services/llm-analysis/test/app.test.ts` convertidos y verdes. La prueba de arquitectura que prohíbe sobrescribir `runAnalysis` sigue verde.

### Dependencias y entregas

- **Necesito:** `CircuitBreaker` y caché (Área 1, fin del día 1) → interfaz tipada con envoltorio mínimo; `RegistryClient`/`ResilientHttpClient` (Área 1, día 2) → URLs estáticas `*_URL`; `GET /internal/tenants/:id/llm-config` (Área 2, día 3) → `TenantLlmConfigProvider` falso; Retrieval publicando `DeterministicResult` (Área 3, día 3) → pruebo Reports con muestras; un gateway real para el CLI (Área 1, día 3) → `AnalysisGateway` falso con `@gyde/contracts/samples`.
- **Entrego:** Reports `create` y `get` al Área 1 (**día 2**); `@gyde/analysis-engine` usable al Área 2 (**día 3**).

### Si hay retraso (recorte)

Parser de Unreal mínimo (solo `.uproject` y `vcpkg.json`) · Markdown simple · un solo proveedor real de IA (más el mock) · caché del CLI en memoria · decorador de licencias reducido a una sección.

### Hecho cuando

`gyde analyze fixtures/projects/unity-sample` imprime un reporte priorizado con las explicaciones de IA; con `llm-analysis` apagado sale **degradado** con los hallazgos determinísticos y el breaker abre y se recupera; el cuerpo que sale del cliente no contiene código ni rutas (prueba de punta a punta); los decoradores componen según el plan; la llave del estudio no aparece en ningún log.

### Primera acción

Lee todo lo anterior y respóndeme con: (1) lo que entendiste de mi área y de cómo encaja con las demás, (2) cualquier contradicción o duda entre documentos y código (por ejemplo, qué proveedor real de IA conviene primero), y (3) el plan de tu primer PR (`feat/analysis-engine-csharp-parser`). **No escribas código hasta que yo diga OK.**
