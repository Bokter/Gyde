# Evidencia de Clean Architecture (2026-10-18)

Evidencia generada sobre `origin/dev` @ `f783c16` (los seis servicios con el refactor completo). Cada afirmación de los ADR, de `CONTRIBUTING.md` y de los README tiene aquí el comando que la comprueba y la salida real que dio al ejecutarse. Los archivos del 2026-10-12 en esta carpeta son anteriores al refactor y no prueban nada de lo que sigue.

Lectura de las salidas: en los `grep`, `(exit 1)` significa "sin coincidencias", que es lo esperado en los criterios de ausencia; `(exit 0)` significa que encontró algo.

Rúbrica de la Entrega 1: 8.14 (código organizado), 8.16 (estructura visible), 8.18 (manejo de errores) y 8.19 (README técnico).

## 1. Estructura por servicio

Árbol real de carpetas (dos niveles bajo cada capa), de `find services/<svc>/src`:

### gateway
```
  application
  application/dto
  application/dto/gateway.dto.ts
  application/errors.ts
  application/ports
  application/ports/api-key-verifier.ts
  application/ports/auth-cache.ts
  application/ports/key-hasher.ts
  application/ports/rate-limiter.ts
  application/ports/report-reader.ts
  application/ports/reports-client.ts
  application/ports/usage-counter.ts
  application/request-context.ts
  application/use-cases
  application/use-cases/authenticate-api-key.use-case.ts
  application/use-cases/enforce-rate-limit.use-case.ts
  application/use-cases/get-report.use-case.ts
  application/use-cases/submit-analysis.use-case.ts
  domain
  domain/api-key-format.ts
  domain/principal.ts
  domain/rate-limit.ts
  domain/usage-allowance.ts
  http
  http/api-key.guard.ts
  http/application-error.interceptor.ts
  http/app.ts
  http/gateway.controller.ts
  http/mappers
  http/mappers/gateway.mapper.ts
  http/rate-limit.guard.ts
  http/request-principal.ts
  infrastructure
  infrastructure/adapters
  infrastructure/adapters/http-reports-client.adapter.ts
  infrastructure/adapters/memory-auth-cache.adapter.ts
  infrastructure/adapters/memory-rate-limiter.adapter.ts
  infrastructure/adapters/memory-usage-counter.adapter.ts
  infrastructure/adapters/sha256-key-hasher.adapter.ts
  infrastructure/adapters/web-api-key-verifier.adapter.ts
  infrastructure/mappers
  infrastructure/mappers/gateway.mapper.ts
  infrastructure/service-resolver.ts
  infrastructure/upstream-errors.ts
```

### registry
```
  application
  application/dto
  application/dto/registry.dto.ts
  application/errors.ts
  application/use-cases
  application/use-cases/deregister-instance.use-case.ts
  application/use-cases/heartbeat-instance.use-case.ts
  application/use-cases/register-instance.use-case.ts
  application/use-cases/resolve-service-instances.use-case.ts
  domain
  domain/entities
  domain/entities/service-instance.entity.ts
  domain/repositories
  domain/repositories/registry.repository.ts
  http
  http/application-error.interceptor.ts
  http/app.ts
  http/mappers
  http/mappers/registry.mapper.ts
  http/registry.controller.ts
  infrastructure
  infrastructure/health-checker.ts
  infrastructure/repositories
  infrastructure/repositories/in-memory-registry.repository.ts
```

### retrieval
```
  application
  application/background-jobs.ts
  application/dto
  application/dto/retrieval.dto.ts
  application/errors.ts
  application/ports
  application/ports/downstream.ts
  application/ports/knowledge-source.ts
  application/use-cases
  application/use-cases/retrieve-evidence.use-case.ts
  domain
  domain/analyzers
  domain/analyzers/base-analyzer.ts
  domain/analyzers/compatibility
  domain/analyzers/licenses
  domain/analyzers/vulnerabilities
  domain/model.ts
  domain/ports.ts
  domain/versions
  domain/versions/affected-range.ts
  domain/versions/version.ts
  http
  http/app.ts
  http/mappers
  http/mappers/retrieval.mapper.ts
  http/retrieval.controller.ts
  infrastructure
  infrastructure/adapters
  infrastructure/adapters/http-knowledge-source.adapter.ts
  infrastructure/adapters/http-llm-client.adapter.ts
  infrastructure/adapters/http-reports-client.adapter.ts
  infrastructure/adapters/sha256-hex.adapter.ts
  infrastructure/adapters/spdx-license-expression-parser.adapter.ts
  infrastructure/mappers
  infrastructure/mappers/knowledge.mapper.ts
  infrastructure/mappers/pipeline.mapper.ts
  infrastructure/service-resolver.ts
  infrastructure/unavailable.ts
```

### normalization
```
  application
  application/dto
  application/dto/knowledge.dto.ts
  application/errors.ts
  application/ports
  application/ports/source-adapter.ts
  application/use-cases
  application/use-cases/ingest-source.use-case.ts
  application/use-cases/list-sources.use-case.ts
  application/use-cases/query-knowledge.use-case.ts
  domain
  domain/cvss.ts
  domain/entities
  domain/entities/knowledge-object.entity.ts
  domain/invalid-record-error.ts
  domain/osv-normalizer.ts
  domain/osv-record.ts
  domain/repositories
  domain/repositories/knowledge.repository.ts
  http
  http/application-error.interceptor.ts
  http/app.ts
  http/mappers
  http/mappers/normalization.mapper.ts
  http/normalization.controller.ts
  infrastructure
  infrastructure/db
  infrastructure/db/database-lifecycle.ts
  infrastructure/db/database.ts
  infrastructure/db/migrate.ts
  infrastructure/db/schema.ts
  infrastructure/mappers
  infrastructure/mappers/knowledge.mapper.ts
  infrastructure/repositories
  infrastructure/repositories/postgres-knowledge.repository.ts
  infrastructure/sources
  infrastructure/sources/community
  infrastructure/sources/official
  infrastructure/sources/structured
```

### llm-analysis
```
  application
  application/background-jobs.ts
  application/dto
  application/dto/llm-analysis.dto.ts
  application/ports
  application/ports/finding-analyzer.ts
  application/ports/model-call-policy.ts
  application/ports/reports-client.ts
  application/ports/tenant-llm-config.ts
  application/use-cases
  application/use-cases/analyze-findings.use-case.ts
  domain
  domain/analysis.ts
  domain/prompt.ts
  domain/redact.ts
  http
  http/app.ts
  http/llm-analysis.controller.ts
  http/mappers
  http/mappers/llm-analysis.mapper.ts
  infrastructure
  infrastructure/adapters
  infrastructure/adapters/anthropic-finding-analyzer.adapter.ts
  infrastructure/adapters/gemini-finding-analyzer.adapter.ts
  infrastructure/adapters/http-reports-client.adapter.ts
  infrastructure/adapters/http-tenant-llm-config.adapter.ts
  infrastructure/adapters/mock-finding-analyzer.adapter.ts
  infrastructure/adapters/resilient-model-call-policy.adapter.ts
  infrastructure/mappers
  infrastructure/mappers/ai-result.mapper.ts
  infrastructure/mappers/analysis-failure.mapper.ts
  infrastructure/mappers/tenant-llm-config.mapper.ts
  infrastructure/model-output.parser.ts
  infrastructure/service-resolver.ts
```

### reports
```
  application
  application/analysis-watchdog.ts
  application/dto
  application/dto/analysis.dto.ts
  application/errors.ts
  application/ports
  application/ports/retrieval-client.ts
  application/use-cases
  application/use-cases/create-analysis.use-case.ts
  application/use-cases/get-report-markdown.use-case.ts
  application/use-cases/get-report.use-case.ts
  application/use-cases/record-ai-result.use-case.ts
  application/use-cases/record-analysis-failure.use-case.ts
  application/use-cases/record-deterministic-result.use-case.ts
  application/use-cases/sweep-stale-analyses.use-case.ts
  domain
  domain/entities
  domain/entities/analysis.entity.ts
  domain/entities/analysis-types.ts
  domain/report
  domain/report/basic-analysis-report.ts
  domain/report/build-report.ts
  domain/report/compose-report.ts
  domain/report/decorators
  domain/report/render-markdown.ts
  domain/report/report-component.ts
  domain/report/report-decorator.ts
  domain/report/report-types.ts
  domain/repositories
  domain/repositories/report.repository.ts
  http
  http/application-error.interceptor.ts
  http/app.ts
  http/mappers
  http/mappers/reports.mapper.ts
  http/reports.controller.ts
  infrastructure
  infrastructure/adapters
  infrastructure/adapters/http-retrieval-client.adapter.ts
  infrastructure/db
  infrastructure/db/database.ts
  infrastructure/db/migrate.ts
  infrastructure/db/schema.ts
  infrastructure/mappers
  infrastructure/mappers/analysis.mapper.ts
  infrastructure/reports-startup.ts
  infrastructure/repositories
  infrastructure/repositories/in-memory-report.repository.ts
  infrastructure/repositories/postgres-report.repository.ts
  infrastructure/service-resolver.ts
```

Resumen (de los árboles anteriores y de los README):

| Servicio | Entidades | Casos de uso | Contratos de repositorio | Adapters (`*.adapter.ts`) | Interceptor de errores |
|---|---|---|---|---|---|
| gateway | 0 | 4 | 0 | 6 | sí |
| registry | 1 | 4 | 1 | 0 | sí |
| retrieval | 0 | 1 | 0 | 5 | no |
| normalization | 1 | 3 | 1 | 1 | sí |
| llm-analysis | 0 | 1 | 0 | 6 | no |
| reports | 1 | 7 | 1 | 1 | sí |

Sin entidades con identidad: `gateway`, `retrieval` y `llm-analysis` modelan value objects y tipos planos (sus README lo dicen), no entidades. `normalization` tiene una sola, `KnowledgeObject`, que es un tipo plano. Solo `registry` (`ServiceInstance`) y `reports` (`Analysis`) tienen entidades con estado y transiciones. Sin interceptor: `retrieval` y `llm-analysis` responden 202 y no traducen errores desde el controlador.

## 2. Greps de aceptación

Criterio: `domain/` solo importa rutas relativas.
```
$ for s in gateway registry retrieval normalization llm-analysis reports; do grep -rnE "from '[^.]" services/$s/src/domain; done
(exit 1)
```

Criterio: `application/` no importa zod, service-kit, resilience, discovery, @nestjs ni node:.
```
$ for s in gateway registry retrieval normalization llm-analysis reports; do grep -rnE "from '(zod|@gyde/service-kit|@gyde/resilience|@gyde/discovery|@nestjs/|node:)" services/$s/src/application; done
(exit 1)
```

Criterio: `domain/` no importa contratos (se busca el import, no la mención en comentarios).
```
$ grep -rnE "from '@gyde/contracts" services/*/src/domain
(exit 1)
```

Allowlist: archivos de `application/` que importan `@gyde/contracts` (todos `import type`).
```
$ grep -rn "@gyde/contracts" services/*/src/application
services/gateway/src/application/ports/report-reader.ts:1:import type { Report } from '@gyde/contracts';
services/gateway/src/application/use-cases/get-report.use-case.ts:1:import type { Report } from '@gyde/contracts';
(exit 0)
```

Cada archivo de la allowlist está nombrado en el README de su servicio.
```
$ for s in gateway registry retrieval normalization llm-analysis reports; do for f in $(grep -rl "@gyde/contracts" services/$s/src/application); do grep -q "$(basename $f)" services/$s/README.md || echo "NO LISTADO: $f"; done; done
(exit 0)
```

Contratos y service-kit intactos respecto a `origin/dev` (antes del refactor de documentación).
```
$ git diff --stat origin/dev -- packages/contracts packages/service-kit
(exit 0)
```

Sin `HttpError` ni `UpstreamServiceError` ni service-kit en `application/` y `domain/`.
```
$ grep -rlE "HttpError|UpstreamServiceError|@gyde/service-kit" services/*/src/application services/*/src/domain
(exit 1)
```

Sin `randomUUID` ni `Date.now()` en `domain/` (hay `new Date(x)` con argumento recibido, no como valor por defecto).
```
$ grep -rnE "randomUUID|Date\.now" services/*/src/domain
(exit 1)
```

```
$ grep -rnE "new Date" services/*/src/domain
services/gateway/src/domain/usage-allowance.ts:3:  return new Date(epochMs).toISOString().slice(0, 7);
services/registry/src/domain/entities/service-instance.entity.ts:102:    const last = new Date(this._lastHeartbeatAt).getTime();
(exit 0)
```

## 3. Lint integrado en `pnpm lint`

Reglas en `tooling/eslint/layer-boundaries.mjs` (`servicePurity`), aplicadas por `eslint.config.mjs`.
```
$ pnpm lint
$ eslint .
(exit 0)
```

Violaciones deliberadas (archivos temporales creados y borrados; la salida de `eslint` es la real):

```
$ printf "import { z } from 'zod';\nexport const x = z.string();\n" > services/reports/src/domain/__tmp_violation.ts && pnpm exec eslint services/reports/src/domain/__tmp_violation.ts
  1:1  error  'zod' import is restricted from being used by a pattern. domain only allows relative imports inside domain/ (no @gyde/*, zod, node:* or libraries)  @typescript-eslint/no-restricted-imports
(exit 1)

$ printf "import { SEVERITY_ORDER } from '@gyde/contracts';\nexport const y = SEVERITY_ORDER;\n" > services/gateway/src/application/__tmp_v.ts && pnpm exec eslint services/gateway/src/application/__tmp_v.ts
  1:1  error  '@gyde/contracts' import is restricted from being used. solo import type; ver ADR 0012  @typescript-eslint/no-restricted-imports
(exit 1)

$ printf "import type { Report } from '@gyde/contracts';\nexport type Y = Report;\n" > services/gateway/src/application/__tmp_v.ts && pnpm exec eslint services/gateway/src/application/__tmp_v.ts
(exit 0)
```

## 4. Errores y composición

Interceptor registrado con `APP_INTERCEPTOR` (traduce errores de aplicación a `HttpError`; el sobre `ApiError` lo sigue produciendo el filtro global de service-kit):
```
$ grep -rn "APP_INTERCEPTOR" services/*/src/app.module.ts
services/gateway/src/app.module.ts:4:import { APP_INTERCEPTOR } from '@nestjs/core';
services/gateway/src/app.module.ts:55:        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
services/normalization/src/app.module.ts:4:import { APP_INTERCEPTOR } from '@nestjs/core';
services/normalization/src/app.module.ts:41:        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
services/registry/src/app.module.ts:2:import { APP_INTERCEPTOR } from '@nestjs/core';
services/registry/src/app.module.ts:49:        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
services/reports/src/app.module.ts:5:import { APP_INTERCEPTOR } from '@nestjs/core';
services/reports/src/app.module.ts:81:        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
(exit 0)
```

Los guards corren antes que los interceptores en el ciclo de vida de Nest; por eso `ApiKeyGuard` del gateway traduce con la misma función. (Razón de diseño; no se probó quitando el `try/catch`.)
```
$ grep -n translateApplicationError services/gateway/src/http/api-key.guard.ts
4:import { translateApplicationError } from './application-error.interceptor';
27:      throw translateApplicationError(error);
(exit 0)
```

Validación en el borde: `ZodValidationPipe` en `http/`; respuestas externas re-validadas con el schema del contrato en `infrastructure/`.
```
$ grep -rn "ZodValidationPipe(" services/*/src/http | head -20
services/gateway/src/http/gateway.controller.ts:60:    @Body(new ZodValidationPipe(AnalysisRequest)) body: AnalysisRequest,
services/llm-analysis/src/http/llm-analysis.controller.ts:27:    @Body(new ZodValidationPipe(LlmAnalysisRequest)) body: LlmAnalysisRequest,
services/normalization/src/http/normalization.controller.ts:36:    @Body(new ZodValidationPipe(KnowledgeQuery)) body: KnowledgeQuery,
services/registry/src/http/registry.controller.ts:50:    @Body(new ZodValidationPipe(ServiceRegistration)) body: ServiceRegistration,
services/reports/src/http/reports.controller.ts:66:    @Body(new ZodValidationPipe(CreateAnalysisJob)) body: CreateAnalysisJob,
services/reports/src/http/reports.controller.ts:99:    @Body(new ZodValidationPipe(DeterministicResult)) body: DeterministicResult,
services/reports/src/http/reports.controller.ts:109:    @Body(new ZodValidationPipe(AiResult)) body: AiResult,
services/reports/src/http/reports.controller.ts:119:    @Body(new ZodValidationPipe(AnalysisFailure)) body: AnalysisFailure,
services/retrieval/src/http/retrieval.controller.ts:27:  retrieve(@Body(new ZodValidationPipe(RetrieveRequest)) body: RetrieveRequest): void {
(exit 0)
```

```
$ grep -rn "\.parse(" services/*/src/infrastructure | head -20
services/gateway/src/infrastructure/adapters/http-reports-client.adapter.ts:27:      return toAnalysisAcceptedDto(AnalysisAccepted.parse(body));
services/gateway/src/infrastructure/adapters/http-reports-client.adapter.ts:42:      return Report.parse(body);
services/gateway/src/infrastructure/adapters/web-api-key-verifier.adapter.ts:22:      return toApiKeyVerificationDto(VerifyApiKeyResponse.parse(body));
services/llm-analysis/src/infrastructure/adapters/http-tenant-llm-config.adapter.ts:49:      return toTenantLlmConfig(InternalLlmConfig.parse(await response.json()));
services/llm-analysis/src/infrastructure/mappers/ai-result.mapper.ts:11:  return AiResult.parse(analysis);
services/llm-analysis/src/infrastructure/model-output.parser.ts:23:  return ModelPayload.parse(JSON.parse(extractJsonText(text)));
services/normalization/src/infrastructure/db/migrate.ts:32:  const journal = JSON.parse(
services/normalization/src/infrastructure/mappers/knowledge.mapper.ts:18:  return KnowledgeObjectContract.parse(value);
services/normalization/src/infrastructure/sources/structured/osv.adapter.ts:83:      const payload: unknown = JSON.parse(await readFile(join(folder, file), 'utf8'));
services/reports/src/infrastructure/db/migrate.ts:32:  const journal = JSON.parse(
services/retrieval/src/infrastructure/adapters/http-knowledge-source.adapter.ts:33:      const answer = KnowledgeQueryResult.parse(json);
services/web/src/infrastructure/db/migrate.ts:32:  const journal = JSON.parse(
(exit 0)
```

Desviación conocida de registry: el `GET` con nombre inválido responde 200 con lista vacía (cast aislado en el mapper, fijado por una prueba).
```
$ grep -n "as ServiceName" services/registry/src/http/mappers/registry.mapper.ts; grep -n "NOT validated today" services/registry/test/characterization.test.ts
30:  return { serviceName: serviceName as ServiceName };
125:  it('resolve with an invalid serviceName is NOT validated today: 200 with an empty list', async () => {
(exit 0)
```

## 5. Tabla guía → código (diapositiva "Estructura por capas" → `reports`)

| Pieza | Archivo | Símbolo |
|---|---|---|
| Entidad | `services/reports/src/domain/entities/analysis.entity.ts` | `Analysis` |
| Contrato de repositorio | `services/reports/src/domain/repositories/report.repository.ts` | `ReportRepository`, `REPORT_REPOSITORY` |
| Caso de uso | `services/reports/src/application/use-cases/create-analysis.use-case.ts` | `CreateAnalysisUseCase` |
| DTO | `services/reports/src/application/dto/analysis.dto.ts` | `CreateAnalysisDto` |
| Puerto externo | `services/reports/src/application/ports/retrieval-client.ts` | `RetrievalClient`, `RETRIEVAL_CLIENT` |
| Errores de aplicación | `services/reports/src/application/errors.ts` | `ReportsError`, `AnalysisNotFoundError` |
| Adaptador de repositorio | `services/reports/src/infrastructure/repositories/postgres-report.repository.ts` | `PostgresReportRepository` |
| Adaptador de puerto | `services/reports/src/infrastructure/adapters/http-retrieval-client.adapter.ts` | `HttpRetrievalClient` |
| Mapper de infraestructura | `services/reports/src/infrastructure/mappers/analysis.mapper.ts` | fila ↔ entidad |
| Mapper HTTP | `services/reports/src/http/mappers/reports.mapper.ts` | `toCreateAnalysisDto` |
| Controlador | `services/reports/src/http/reports.controller.ts` | `ReportsController` |
| Interceptor | `services/reports/src/http/application-error.interceptor.ts` | `ApplicationErrorInterceptor` |
| Composition root | `services/reports/src/app.module.ts` | `APP_INTERCEPTOR`, `REPORT_REPOSITORY`, `RETRIEVAL_CLIENT` |

Comprobación de que cada ruta existe:

```
$ for f in $(grep -oE "services/reports/src/[A-Za-z0-9_./-]+" docs/evidence/clean-architecture-2026-10-18.md | sort -u | grep -v __tmp); do [ -e "$f" ] || echo "NO EXISTE: $f"; done
(exit 0)
```

## 6. Patrones y la prueba que los respalda

| Patrón | Dónde | Prueba |
|---|---|---|
| Decorator | `services/reports/src/domain/report/` | `services/reports/test/report-decorator.test.ts` |
| Circuit Breaker + Service Discovery | `services/reports/src/infrastructure/adapters/http-retrieval-client.adapter.ts`, `services/gateway/src/infrastructure/adapters/` | `services/reports/test/http-retrieval-client.test.ts`, `services/gateway/test/app.test.ts` |
| Template Method | `services/retrieval/src/domain/analyzers/base-analyzer.ts` | `services/retrieval/test/base-analyzer.test.ts` |
| Strategy por proveedor + política de resiliencia | `services/llm-analysis/src/infrastructure/adapters/` | `services/llm-analysis/test/gemini-finding-analyzer.test.ts`, `services/llm-analysis/test/resilient-model-call-policy.test.ts` |
| Repository | `services/*/src/domain/repositories/` e `infrastructure/repositories/` | `services/reports/test/postgres-report-repository.test.ts`, `services/normalization/test/knowledge-repository.test.ts` |

Que estas pruebas existen y ejercitan el patrón no equivale a una prueba de mutación: no se comprobó que fallen si el patrón se rompe.

## 7. Humo del stack

El humo completo (incluida la parte del gateway: clave válida y errónea, `/internal/*` no enrutado, `POST` y `GET /v1/analyses`, Markdown y `503` con Reports detenido) pasó con el stack reconstruido desde `origin/dev`. Salida íntegra en `humo-2026-10-18.txt`. Se usó una clave de prueba nueva para el tenant local de desarrollo `gyde-dev-seed`, con el mock de IA.

## 8. Pruebas por servicio

Resultados medidos sobre `origin/dev` @ `f783c16` al cerrar el refactor de estructura (comando: `pnpm --filter @gyde/<svc> test`):

| Servicio | Pruebas |
|---|---|
| registry | 32 |
| normalization | 139 (+4 `it.todo`) |
| gateway | 94 |
| llm-analysis | 65 |
| retrieval | 157 (+3 `it.todo`) |
| reports | 165 |

## 9. No verificado

- `pnpm test` ni `pnpm build` de la raíz con `--force`, ni `pnpm docker:check`.
- Que cada prueba de patrón falle al romper el patrón (mutación).
- El razonamiento de que los guards corren antes que los interceptores (sin prueba negativa).
- La validación del `workspace.dsl` con Structurizr y los SVG regenerados (PR de C4).
- Revisión humana del código.
