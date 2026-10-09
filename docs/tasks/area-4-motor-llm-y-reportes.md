# Área 4: Motor, LLM y Reportes

> **Responsable:** _(asignar)_ · Lee primero el [plan del equipo](00-resumen.md).

## Objetivo

Construir el recorrido completo de un análisis desde el punto de vista del producto: el **motor del cliente** (parsers, pipeline, API client) y el **CLI**, el **servicio de análisis con IA** (BYOK) y el **servicio de Reportes**, que orquesta todo y compone el reporte final con el patrón **Decorator**. Aquí viven tres de los cinco patrones del documento: **Template Method**, **Abstract Factory** y **Decorator**.

Tu trabajo es el que más se ve en la demo: el reporte.

## Lecturas obligatorias

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) · [Visión general](../architecture/00-vision-general.md) · [Flujos](../architecture/02-flujos.md) (todos) · [Patrones](../architecture/03-patrones.md) (Abstract Factory, Template Method, Decorator) · [ADR 0004](../adr/0004-el-backend-orquesta-el-analisis.md) · [ADR 0006](../adr/0006-donde-viven-los-patrones-de-diseno.md) · [ADR 0007](../adr/0007-llaves-llm-por-estudio-byok.md) · [fixtures/README](../../fixtures/README.md) · README de `packages/analysis-engine`, `apps/cli`, `services/llm-analysis`, `services/reports`.

## Qué construyes y cómo está hoy

| Módulo | Estado hoy | Tu trabajo |
|---|---|---|
| `packages/analysis-engine` | **Hecho:** orden del Template Method, fábricas Unity/Unreal, puerta de privacidad. **TODO:** parsers, `GydeApiClient`, pasos 4 y 5, hooks de los pipelines | Implementar lo TODO |
| `apps/cli` | Stub que sale con código 2 | `gyde analyze` completo |
| `services/llm-analysis` | Stubs `501`, puertos y caso de uso documentados | Proveedores, caso de uso, endpoint |
| `services/reports` | Stubs `501`; **Decorator** (base) hecho y probado | Ciclo de vida, decoradores concretos, persistencia, Markdown |

## Archivos

**Sí tocas:** `packages/analysis-engine/**` · `apps/cli/**` · `services/llm-analysis/**` · `services/reports/**` · `fixtures/projects/**` (amplía, explicando en `fixtures/README.md`).

**No tocas:** el resto de servicios y apps. `apps/github-action` es del Área 2 (consume tu motor). Para `packages/contracts` abre un PR pequeño y pide revisión a otra área.

## Contratos

`AnalysisRequest` (estricto: **no lo relajes**), `AuthVerifyResponse`, `AnalysisAccepted`, `Report`, `ReportLayer`, `DegradedReason`, `CreateAnalysisJob`, `RetrieveRequest`, `DeterministicResult`, `LlmAnalysisRequest`, `AiResult`, `AnalysisFailure`, `InternalLlmConfig`, `Entitlements`, `Finding`, `ROUTES.reports.*`, `ROUTES.llmAnalysis.*`, `ROUTES.gateway.*`.

## Entregables y criterios de aceptación

### Reports (días 1 a 3: el Área 1 depende de `create` y `get`)

- [ ] **`AnalysisLifecycle`** con la máquina de estados del README (`pending → retrieving → analyzing → ready`, `failed`): `create` guarda el trabajo, llama a Retrieval (con breaker y discovery) y responde `202`; `recordDeterministic`, `recordAi`, `recordFailure` y `getReport`. **Entrega `POST /internal/analyses` y `GET /internal/analyses/:id` el día 2.**
- [ ] **Persistencia** en PostgreSQL (schema `reports`, `REPORTS_DATABASE_URL`, migraciones) detrás de `ReportRepository`.
- [ ] **Degradado:** un reporte es `degraded` solo si se esperaba IA y no pudo correr (`llm-unavailable`, `llm-not-configured`, `llm-error`); si el plan o el cliente no pidieron IA, **no** lo es. Si el resultado de IA no llega en `REPORTS_AI_TIMEOUT_MS`, pasa a `ready` y degradado. Un fallo de Retrieval deja el reporte `failed` con un error claro.
- [ ] **Decoradores concretos** sobre la base ya hecha: `SeverityScoreDecorator` (puntaje 0-100 determinístico, va **último**), `LicenseComplianceDecorator`, `AiEnrichmentDecorator` (mezcla el `AiResult` por id de hallazgo y respeta su prioridad). Devuelven objetos nuevos.
- [ ] **`composeReport(input)`** arma la cadena según `Entitlements` (free: básico + licencias + severidad, nunca IA; pro y studio suman IA solo con un `AiResult` presente).
- [ ] **`renderMarkdown`**: hallazgos ordenados por severidad con evidencia, impacto y recomendación, y un aviso claro cuando el reporte es degradado.
- [ ] Endpoints: `GET /internal/analyses/:id/markdown`, `POST .../deterministic`, `POST .../ai-result`, `POST .../failure` (todos validan con los esquemas).
- [ ] Todos los `it.todo` de `services/reports/test/*.test.ts` convertidos y verdes.

### llm-analysis (días 2 a 4)

- [ ] **`TenantLlmConfigProvider`** HTTP hacia Web (`GET /internal/tenants/:id/llm-config`), con caché **en memoria** de un minuto como máximo; la llave **nunca** se escribe a disco ni a logs.
- [ ] **`FindingAnalyzer`**: un proveedor **mock determinístico** (solo con `LLM_MOCK_ENABLED=true`) y **un proveedor real** (Anthropic u OpenAI; usa la llave del tenant). El prompt correlaciona evidencia y contexto del proyecto; la salida se **valida con el esquema `AiResult`** y no se ejecuta nada de lo que devuelva el modelo.
- [ ] **`AnalyzeFindings`** con las reglas del README: sin llave → `AnalysisFailure` `llm-not-configured`; circuito abierto o proveedor caído → `llm-unavailable` (sirve la última clasificación cacheada si existe); error del proveedor → `llm-error`. Nunca lanza hacia quien llama.
- [ ] **Circuit Breaker por tenant + proveedor** (`@gyde/resilience`): un estudio con la llave inválida no abre el circuito de los demás.
- [ ] `POST /internal/analyze` responde `202` al instante y termina en segundo plano publicando a Reports.
- [ ] Prueba de seguridad: la llave **no aparece** en logs, errores ni mensajes publicados.
- [ ] Todos los `it.todo` de `services/llm-analysis/test/app.test.ts` convertidos y verdes.

### analysis-engine y CLI (días 1 a 4)

- [ ] **`CsharpDependencyParser`** sobre `fixtures/projects/unity-sample`: el resultado es **exactamente** `expected-parse.json` (UPM desde `Packages/manifest.json`, NuGet desde `packages.config` con la licencia del `.nuspec`, versión del editor desde `ProjectVersion.txt`, ordenado por ecosistema y nombre, sin `com.unity.modules.*`).
- [ ] **`CppDependencyParser`** y **`detectGameEngine`** sobre `unreal-sample` (la propuesta de `fixtures/README.md`; ajústala y documenta).
- [ ] **`GydeApiClient`**: `Authorization: Bearer`, respuestas validadas con los esquemas, **Circuit Breaker + caché local** (sirve el último reporte como degradado), errores accionables para 401, 402 y 429, **nunca registra la API key**.
- [ ] Pasos pendientes del **Template Method**: `analyzeLicenses` y `generateReport` (consulta con tiempo límite hasta `ready`, fallo claro si queda `failed`, resultado degradado desde la caché si el gateway no responde). Las dos implementaciones de fetchers (OSV/NVD) filtran la evidencia por fuente.
- [ ] **`LocalCLIPipeline`** (`parseDependencies` con `buildAnalysisRequest`, `publishResult` a consola) y **`apps/cli`**: `gyde analyze [ruta]` con los argumentos y códigos de salida de su README; formatos `text`, `json` y `markdown`.
- [ ] **Prueba de privacidad de punta a punta:** ejecutar el pipeline sobre `unity-sample` con un gateway falso y comprobar que el cuerpo enviado **no contiene** `PROPRIETARY_MARKER_DO_NOT_SEND` ni rutas de archivos.
- [ ] El test de arquitectura que prohíbe sobrescribir `runAnalysis` sigue verde. Todos los `it.todo` de `packages/analysis-engine/test/acceptance.test.ts` convertidos.
- [ ] `GitHubActionPipeline` lo implementa el Área 2 usando tu motor; deja los hooks bien documentados.

## Dependencias con otras áreas

| Necesitas | De | Mientras tanto |
|---|---|---|
| `CircuitBreaker` y caché | Área 1 (fin del día 1) | Interfaz tipada; envoltorio mínimo |
| `RegistryClient` / `ResilientHttpClient` | Área 1 (día 2) | URLs estáticas `*_URL` |
| `GET /internal/tenants/:id/llm-config` | Área 2 (día 3) | `TenantLlmConfigProvider` falso |
| Retrieval publicando `DeterministicResult` | Área 3 (día 3) | Reports se prueba con `DeterministicResult` de muestra |
| Un gateway real para el CLI | Área 1 (día 3) | `AnalysisGateway` falso con `@gyde/contracts/samples` |

| Entregas | A quién | Cuándo |
|---|---|---|
| Reports `create` y `get` | Área 1 (gateway) | **Día 2** |
| `@gyde/analysis-engine` usable | Área 2 (la Action) | **Día 3** |

## Orden sugerido

1. **Día 1:** `CsharpDependencyParser` y `GydeApiClient` · `AnalysisLifecycle` con repositorio en memoria (`create`/`get`).
2. **Día 2:** Reports `create`/`get` publicados · decoradores + `composeReport` · pasos 4 y 5 del pipeline.
3. **Día 3:** llm-analysis completo · persistencia PostgreSQL de Reports · CLI.
4. **Día 4:** integración E2E; Markdown; `CppDependencyParser`.
5. **Día 5:** pulido del reporte (es lo que se muestra), prueba de privacidad, documentación.

## Si hay retraso

Parser de Unreal mínimo (solo `.uproject` y `vcpkg.json`) · Markdown simple · un solo proveedor real de IA (más el mock) · caché del CLI en memoria · decorador de licencias reducido a una sección.

## Prompt listo para tu asistente

```text
Eres un ingeniero de software senior en el monorepo Gyde (TypeScript, pnpm, Fastify, Vitest, PostgreSQL). Trabajas en el Área 4: motor del cliente y CLI, servicio de análisis LLM (BYOK) y servicio de Reportes.

Antes de escribir código, lee: CONTRIBUTING.md, docs/architecture/00-vision-general.md, 02-flujos.md, 03-patrones.md, docs/adr/0004-..., 0006-..., 0007-..., fixtures/README.md, docs/tasks/area-4-motor-llm-y-reportes.md y los README de packages/analysis-engine, apps/cli, services/llm-analysis y services/reports.

Objetivo: (1) reports: AnalysisLifecycle, persistencia, decoradores concretos (Severity, License, AI), composeReport por plan y renderMarkdown; (2) llm-analysis: obtener la llave del tenant, llamar al proveedor detrás de un breaker por tenant+proveedor, validar con AiResult y publicar a Reports; (3) analysis-engine y CLI: parsers Unity/Unreal, GydeApiClient, pasos pendientes del Template Method y `gyde analyze`.

Reglas:
- Tipos y esquemas de @gyde/contracts: no los dupliques. AnalysisRequest es estricto: NO lo relajes. Todo lo que sale del cliente pasa por buildAnalysisRequest.
- Arquitectura limpia en los servicios: http -> application -> domain; infrastructure -> application; puertos en application/ports. Los patrones (Template Method, Abstract Factory, Decorator) ya tienen estructura y pruebas: respétalas y extiéndelas. Ninguna subclase sobrescribe runAnalysis.
- Los decoradores devuelven objetos nuevos y no mutan lo envuelto; el de severidad va último. Un reporte es degradado solo si se esperaba IA y no pudo correr.
- Seguridad BYOK: la llave del estudio solo en memoria durante la llamada, NUNCA en logs, errores, mensajes ni disco. La salida del modelo se trata como no confiable (validar con AiResult).
- Cada llamada saliente va detrás de un Circuit Breaker de @gyde/resilience (del Área 1; hasta que exista, usa la interfaz tipada). Nada de direcciones fijas: discovery con respaldo a URLs estáticas.
- Los it.todo de las pruebas de cada módulo son tus criterios de aceptación: conviértelos en pruebas reales. El parseo de unity-sample debe ser exactamente fixtures/projects/unity-sample/expected-parse.json.
- Trabaja solo en packages/analysis-engine, apps/cli, services/llm-analysis, services/reports y fixtures/projects.

Orden: 1) CsharpDependencyParser + GydeApiClient + AnalysisLifecycle (create/get, el Área 1 lo espera el día 2), 2) decoradores + composeReport + pasos 4 y 5 del pipeline, 3) llm-analysis + PostgreSQL de Reports + CLI, 4) Markdown + CppDependencyParser + prueba de privacidad de punta a punta.

Cómo trabajar: ramas cortas "<tipo>/<módulo>-<descripción>", commits Conventional Commits en inglés (scopes: analysis-engine, cli, llm-analysis, reports, fixtures), PRs de menos de un día. Antes de cada PR corre pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build. Al terminar cada tarea resume qué hiciste, qué decidiste y qué queda.
```
