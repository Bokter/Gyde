# Modelo C4

La arquitectura de Gyde en los tres primeros niveles del [modelo C4](https://c4model.com). **La única fuente es [`c4/workspace.dsl`](c4/workspace.dsl)** ([Structurizr DSL](https://docs.structurizr.com/dsl)), y las imágenes de esta página se exportan de ella. Ningún otro documento dibuja contexto, contenedores ni componentes: si algo cambia, se cambia el DSL y se vuelven a exportar las vistas ([cómo](#cómo-se-edita-y-se-exporta)).

Cada componente nombra el **archivo del código** donde vive, para que el modelo y el código se puedan contrastar. Convenciones: gris = sistema externo; verde = cliente (entorno del usuario); amarillo = puerto (interfaz); naranja = clase abstracta; borde punteado = esqueleto; flecha continua = llamada síncrona o uso; punteada = infraestructura (registry), ingesta o inferencia externas, o «implementa».

| Nivel | Responde | Vista |
|---|---|---|
| 1. Contexto | ¿Quién usa Gyde y con qué sistemas habla? | [Contexto](#nivel-1-contexto) |
| 2. Contenedores | ¿Qué procesos se despliegan y cómo se hablan? | [Contenedores](#nivel-2-contenedores) (detalle en [01 Contenedores](01-contenedores.md)) |
| 3. Componentes | ¿Cómo está hecho por dentro cada contenedor clave? | [CLI](#cli-y-analysis-engine-template-method-y-abstract-factory), [gateway](#gateway-clean-architecture-visible), [reports](#reports-decorator), [retrieval](#retrieval-template-method), [llm-analysis](#llm-analysis-agnóstico-del-proveedor), [registry](#registry-service-discovery-y-health-checker) |

Lo que pasa en el tiempo (análisis feliz, degradado, fallo, Stripe, BYOK) no es parte del modelo estático: está en [02 Flujos](02-flujos.md).

## Nivel 1: contexto

![Contexto: el desarrollador usa Gyde, que habla con GitHub, Stripe, las fuentes públicas y el proveedor de IA del estudio](c4/Contexto.svg)

Frontera de privacidad: el **código fuente del cliente nunca cruza** hacia Gyde; solo viajan nombres, versiones y licencias ([04 Datos, privacidad y seguridad](04-datos-privacidad-seguridad.md)). El proveedor de IA es **el que elige cada estudio** con su propia llave (BYOK, [ADR 0007](../adr/0007-llaves-llm-por-estudio-byok.md)); el modelo no depende de cuál sea.

## Nivel 2: contenedores

![Contenedores: CLI y GitHub Action en el entorno del cliente; gateway, web, reports, retrieval, normalization, llm-analysis, registry y PostgreSQL en el backend](c4/Contenedores.svg)

Detalles que el diagrama resume:
- Los clientes son la **CLI** y la **GitHub Action**, ambos sobre `@gyde/analysis-engine` (una librería, no un contenedor: se ve por dentro en la vista de componentes de la CLI). Solo conocen la URL del gateway.
- Las llamadas entre servicios usan `ResilientHttpClient` (`packages/service-kit`): **descubren la instancia en el registry** (con `*_URL` como respaldo de desarrollo) y van **detrás de un Circuit Breaker**.
- `/internal/*` exige `x-internal-token` y el gateway **nunca** lo enruta.
- El Servicio Web habla con el proveedor de IA solo para **probar la llave** del estudio al guardarla, siempre con el probador de su propio proveedor; la inferencia la hace llm-analysis.
- Reports guarda los análisis en su schema de PostgreSQL (`PostgresReportRepository`, con migraciones propias y un barrido de arranque que cierra los análisis colgados). Sin `REPORTS_DATABASE_URL` usa `InMemoryReportRepository`: el composition root elige el adaptador y el puerto `ReportRepository` no cambia.

## Nivel 3: componentes

### CLI y analysis-engine: Template Method y Abstract Factory

![Componentes de la CLI: AnalysisPipeline y LocalCLIPipeline, fábricas de toolchain Unity y Unreal, puerta de privacidad y GydeApiClient](c4/Componentes-CLI.svg)

`packages/analysis-engine/src/{pipeline,toolchain,privacy,client}`. Una familia (Unity: C# + OSV) o la otra (Unreal: C++ + NVD) se elige según el proyecto; el pipeline solo conoce las interfaces. La GitHub Action usa el mismo motor con `PullRequestCommentPipeline` (`apps/github-action`, sobre `GitHubActionPipeline`), cuyo `publishResult` comenta el reporte en el PR.

### gateway: Clean Architecture visible

![Componentes del gateway: guards y controlador, casos de uso con sus puertos y adaptadores de infraestructura](c4/Componentes-gateway.svg)

Archivos en `services/gateway/src/{http,application,domain,infrastructure}`. `domain/` tiene `Principal`/`Entitlements`, `RateLimitWindow`, `TenantUsage` e `isWellFormedApiKey`; `application/` tiene dos casos de uso separados (`SubmitAnalysis` y `GetReport`), DTO, errores y el puerto `ReportReader`; el `ApplicationErrorInterceptor` de `http/` traduce los errores de aplicación a HTTP. El límite de tasa es **por clave de API (`apiKeyId`), con ventana fija de 1 minuto**. La caché de verify se indexa por **SHA-256 de la clave**, nunca por la clave. Los contadores del plan y de tasa están en memoria (se pierden al reiniciar): limitación asumida del MVP.

### reports: Decorator

![Componentes de reports: AnalysisLifecycle, composeReport y la cadena de decoradores, puertos y adaptadores](c4/Componentes-reports.svg)

Cadena en tiempo de ejecución (`services/reports/src/domain/report/compose-report.ts`): `Basic → LicenseCompliance → AiEnrichment (solo si el plan lo incluye y llegó el resultado de IA) → SeverityScore` (siempre último). El plan `free` nunca lleva IA; con IA caída el reporte sale **degradado** pero con los mismos hallazgos.

El modelo agrupa los casos de uso por responsabilidad, no uno por caja: `CreateAnalysis`, `RecordResults` (`RecordDeterministicResult`, `RecordAiResult`, `RecordAnalysisFailure`), `GetReports` (`GetReport`, `GetReportMarkdown`) y `SweepStaleAnalyses`, junto con `AnalysisWatchdog`. La entidad `Analysis` recorre `retrieving → analyzing → ready | failed`; el estado `pending` existe en el contrato pero nunca se escribe. El contrato de persistencia (`ReportRepository`) está en `domain/repositories/`.

### retrieval: Template Method

![Componentes de retrieval: RetrieveEvidence, BaseAnalyzer y sus analizadores, puertos y adaptadores HTTP](c4/Componentes-retrieval.svg)

`services/retrieval/src/domain/analyzers/`. Las subclases rellenan los pasos variables (`select`, `match`, `toFinding`); el esqueleto y la priorización están en la clase base. `CompatibilityAnalyzer` es un esqueleto: no se instancia en el MVP. Retrieval **no tiene interceptor**: el controlador responde `202` y procesa en segundo plano (`BackgroundJobs`), así que no traduce errores.

### llm-analysis: agnóstico del proveedor

![Componentes de llm-analysis: AnalyzeFindings sobre el puerto FindingAnalyzer, con un adaptador por proveedor y un mock](c4/Componentes-llm-analysis.svg)

`AnalyzeFindings` solo conoce el puerto `FindingAnalyzer`. Cada proveedor soportado es **un adaptador** en `services/llm-analysis/src/infrastructure/adapters/` (Anthropic y Gemini, más el mock de desarrollo): añadir uno no toca el caso de uso ni el dominio. La llave del tenant solo se entrega al proveedor al que pertenece. El caso de uso hace cada llamada a través del puerto `ModelCallPolicy` (`application/ports/model-call-policy.ts`), que implementa `ResilientModelCallPolicy`: ahí viven el Circuit Breaker por tenant + proveedor y la caché de respaldo, no en cada proveedor. `openai` figura en el contrato sin adaptador: el caso de uso responde `llm-error`. Qué proveedores hay hoy: [`services/llm-analysis/README.md`](../../services/llm-analysis/README.md).

### registry: Service Discovery y Health Checker

![Componentes del registry: controlador, casos de uso de registro, repositorio en memoria y Health Checker](c4/Componentes-registry.svg)

Cada servicio se registra al arrancar (`startService`, `packages/discovery`) y envía latidos; el Health Checker elimina instancias que no responden. Quien llama resuelve la instancia, pasa por el breaker (`packages/resilience`; por dependencia y, en llm-analysis, por **tenant + proveedor**) y, si no hay instancia sana, responde `503 upstream_unavailable` sin quedarse colgado.

## Cómo se edita y se exporta

1. Edita [`c4/workspace.dsl`](c4/workspace.dsl) y valídalo:
   ```bash
   docker run --rm -v "$PWD/docs/architecture/c4:/w" structurizr/structurizr validate -w /w/workspace.dsl
   ```
   Sin salida es que está bien; un error indica la línea.
2. Ábrelo en Structurizr local. El contenedor escribe en su carpeta de datos, así que usa una copia:
   ```bash
   mkdir -p /tmp/gyde-c4 && cp docs/architecture/c4/workspace.dsl /tmp/gyde-c4/ && chmod -R a+rwX /tmp/gyde-c4
   docker run --rm -p 127.0.0.1:8080:8080 -v /tmp/gyde-c4:/usr/local/structurizr structurizr/structurizr local
   ```
   y abre `http://127.0.0.1:8080/workspace/1/diagrams`.
3. Exporta cada vista a SVG desde esa página y reemplaza el archivo del mismo nombre en `docs/architecture/c4/` (el nombre es la clave de la vista: `Contexto`, `Contenedores`, `Componentes-<contenedor>`). La imagen Docker no exporta PNG/SVG desde la línea de comandos ([documentación](https://docs.structurizr.com/export/png-and-svg)), por eso se exporta desde el navegador.
4. Commitea el DSL y los SVG juntos, en el mismo PR.

> Los cinco SVG de componentes (`Componentes-gateway.svg`, `Componentes-reports.svg`, `Componentes-retrieval.svg`, `Componentes-llm-analysis.svg` y `Componentes-registry.svg`) quedan desfasados respecto del DSL actual y deben re-exportarse (paso 3). `Contexto`, `Contenedores` y `Componentes-CLI` no cambian.

## Coherencia con el código y alcance honesto

| Afirmación del modelo | Evidencia |
|---|---|
| Cadena Decorator y plan `free` sin IA | `pnpm --filter @gyde/reports test` (`services/reports/test/report-decorator.test.ts`: «composeReport: free plan…»); ejecución real en [`docs/evidence/humo-2026-10-18.txt`](../evidence/humo-2026-10-18.txt) |
| Degradado sin caída del análisis | `services/reports/test/analysis.test.ts` («is degraded only when an llm failure…»); caso de degradado en el mismo archivo de humo |
| Circuit Breaker por tenant + proveedor y caché de respaldo en `ResilientModelCallPolicy` | `services/llm-analysis/test/resilient-model-call-policy.test.ts` («keeps one breaker per scope») |
| Límite de tasa por `apiKeyId`, ventana fija | `services/gateway/test/domain/rate-limit.test.ts` (`RateLimitWindow`) |
| Circuit Breaker + Discovery y `/internal/*` no se enruta | [`docs/evidence/humo-2026-10-18.txt`](../evidence/humo-2026-10-18.txt): con Reports detenido el gateway responde `503` y se recupera; `/internal/*` responde `404` |
| Layering impuesto | `pnpm lint` falla si `domain` importa algo no relativo o si `application` importa `zod`, `@gyde/service-kit`, `@gyde/resilience`, `@gyde/discovery`, `@nestjs/*` o `node:*`; comandos de comprobación en [`docs/evidence/clean-architecture-2026-10-18.md`](../evidence/clean-architecture-2026-10-18.md) |
| Cada componente existe | `grep -noE "services/[a-z-]+/src/[A-Za-z0-9_./-]+" docs/architecture/c4/workspace.dsl docs/architecture/05-modelo-c4.md \| while IFS=: read -r f l p; do [ -e "$p" ] \|\| echo "$f:$l NO EXISTE $p"; done` no imprime nada |

Fuera del MVP o en esqueleto, declarado: `CompatibilityAnalyzer`, fuentes NVD y GHSA, contadores de plan y tasa persistentes. La GitHub Action está implementada y probada con un gateway falso, pero no se demuestra en vivo contra un gateway local.
