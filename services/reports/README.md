# reports: Servicio de Reportes

**Consolida** lo determinístico (Retrieval) y lo producido por el LLM en un **reporte de riesgo priorizado y explicable** (evidencia, impacto, recomendación). Es el **orquestador** del análisis: crea el trabajo, pide la evidencia a Retrieval y arma el reporte final.

> **Estado:** `POST /internal/analyses` y `GET /internal/analyses/:id` **en vivo** (cliente HTTP de Retrieval con Service Discovery y Circuit Breaker, mediante `ResilientHttpClient`), **persistencia PostgreSQL** con migraciones y barrido de arranque, y render Markdown. Decorator (base hecha); decoradores concretos: **Área 4** (`docs/tasks/area-4-motor-llm-y-reportes.md`).

- Puerto: `REPORTS_PORT` (4500) · Solo red interna (el gateway es su cliente).
- Datos propios: schema `reports` de PostgreSQL (`REPORTS_DATABASE_URL` es **opcional**: sin ella el servicio corre en memoria, pensado para desarrollo local y tests).
- Origen en el documento: contenedor *Servicio de reportes* ("Reporte final priorizado") y el patrón **Decorator**.

## Patrón Decorator

| Participante (UML del PDF) | Código (`src/domain/report/`) |
|---|---|
| `ReportComponent` (Component) | `report-component.ts` |
| `BasicAnalysisReport` (ConcreteComponent) | `basic-analysis-report.ts` |
| `ReportDecorator` (Decorator) | `report-decorator.ts` |
| `SeverityScoreDecorator`, `LicenseComplianceDecorator`, `AIEnrichmentDecorator` (PDF) | `decorators/*.decorator.ts`; la clase del código se llama `AiEnrichmentDecorator` |
| Composición según la API key | `compose-report.ts` (`composeReport`) |

Las capas se combinan **en tiempo de ejecución según los permisos del plan** (`Entitlements`), sin una clase por combinación. Los decoradores devuelven objetos nuevos: nunca mutan lo que envuelven. La IA ya trabajó en `llm-analysis`; aquí `AiEnrichmentDecorator` solo **mezcla** su `AiResult`.

> **Decisión:** el Decorator vive aquí y no en el cliente, porque necesita el resultado del LLM, los datos de licencias y los permisos de la API key. Ver `docs/adr/`.

## Ciclo de vida (entidad `Analysis`)

La máquina de estados vive en la entidad `Analysis` (`src/domain/analysis/analysis.ts`); los casos de uso la cargan, le aplican una transición y la guardan.

```
create ──▶ retrieving ──▶ analyzing ──▶ ready
                  │             │
                  └─(sin IA)────┼──────▶ ready
                                └─(falla de IA)──▶ ready + degraded
retrieval-error ──▶ failed
retrieving ──(sin respuesta de Retrieval en REPORTS_RETRIEVAL_TIMEOUT_MS)──▶ failed
```

`pending` existe en el vocabulario del contrato (`ReportStatus`) pero ninguna transición lo escribe: `create` guarda el análisis directamente como `retrieving`.

- Un reporte es **degradado** solo si se esperaba IA y no pudo correr (`llm-unavailable`, `llm-not-configured`, `llm-error`). Si el plan o el cliente no pidieron IA, **no** es degradado.
- Nunca se queda colgado: si el resultado de IA no llega en `REPORTS_AI_TIMEOUT_MS`, pasa a `ready` y degradado (`llm-unavailable`).
- Tampoco se queda en `retrieving`: si Retrieval aceptó el trabajo (202) pero no entrega ni el resultado ni un `AnalysisFailure` en `REPORTS_RETRIEVAL_TIMEOUT_MS`, el análisis pasa a `failed` con `retrieval-error`. El temporizador solo se arma si la llamada a Retrieval tuvo éxito y no hace nada si el análisis ya salió de `retrieving`.
- Los dos temporizadores viven en memoria y **no sobreviven a un reinicio**: al arrancar, `ReportsStartup` ejecuta el **barrido de recuperación** (`SweepStaleAnalyses`) sobre lo que quedó a medias en la ejecución anterior, con los mismos umbrales:
  - `analyzing` más antiguo que `REPORTS_AI_TIMEOUT_MS` → `ready` + degradado (`llm-unavailable`).
  - `retrieving` más antiguo que `REPORTS_RETRIEVAL_TIMEOUT_MS` → `failed` (`retrieval-error`).
  <br>Con el repositorio en memoria no hay nada que barrer (el arranque empieza vacío), así que el barrido solo corre con base de datos.
  - **Límite conocido:** el barrido solo cierra lo que ya superó su umbral. Un análisis que llevaba menos de `REPORTS_AI_TIMEOUT_MS` en `analyzing` (o menos de `REPORTS_RETRIEVAL_TIMEOUT_MS` en `retrieving`) cuando Reports se reinició se queda sin temporizador, porque el reinicio perdió el suyo, y el barrido aún no lo cierra. Si su resultado no llega, no se cierra solo.
- Si Retrieval no responde al crear el trabajo, este queda `failed` con un error claro y el `202` se responde igualmente (el cliente lo ve en el `GET`).
- Leer o registrar un análisis que **no existe** responde `404 not_found` (nunca un 500), igual para `GET`, `markdown` y los tres `POST` de resultados.
- Un `deterministic` repetido (estado que ya no es `retrieving`) se **ignora**: no sobrescribe el resultado ni devuelve el análisis a `analyzing`.

## Formato del Markdown (`renderMarkdown`)

1. Título con el id del análisis y la fecha.
2. Aviso de **degradado** (solo si lo es): qué falta (la explicación de IA) y por qué (`llm-unavailable`, `llm-not-configured` o `llm-error`), y que los hallazgos siguen siendo válidos.
3. Resumen: conteo por severidad y `riskScore` (si la capa de severidad corrió).
4. Sección "Cumplimiento de licencias" (si la capa de licencias corrió): agrupa los hallazgos `kind='license'` (conflictivas y desconocidas).
5. Hallazgos agrupados por severidad (críticos → informativos). Dentro de cada grupo se respeta el orden que dejó la cadena de decoradores (no se ordena por CVSS; si corrió IA, primero los hallazgos que nombró la IA, en su orden de prioridad): cada uno con título, paquete y versión, **evidencia**, **impacto**, **recomendación**, su explicación de IA cuando exista y sus referencias.

## API interna

| Método y ruta | Cuerpo | Respuesta | Estado |
|---|---|---|---|
| `POST /internal/analyses` | `CreateAnalysisJob` | `202 AnalysisAccepted` | **en vivo** |
| `GET /internal/analyses/:analysisId` | cabecera `x-gyde-tenant-id` | `Report` (`404` si es de otro tenant o falta la cabecera) | **en vivo** |
| `GET /internal/analyses/:analysisId/markdown` | cabecera `x-gyde-tenant-id` | `text/markdown` (mismo `404`) | **en vivo** |
| `POST /internal/analyses/:analysisId/deterministic` | `DeterministicResult` | `204` (desde Retrieval) | **en vivo** |
| `POST /internal/analyses/:analysisId/ai-result` | `AiResult` | `204` (desde llm-analysis) | **en vivo** |
| `POST /internal/analyses/:analysisId/failure` | `AnalysisFailure` | `204` | **en vivo** |

## Estructura

```
src/domain/analysis/     Analysis (entidad: transiciones, time-outs, pertenencia al tenant) y los tipos del pipeline
src/domain/report/       Decorator (base, decoradores concretos, composeReport), buildReport (Report a partir de
                         un Analysis), renderMarkdown y report-types.ts; solo imports relativos
src/application/         casos de uso (create-analysis, record-deterministic-result, record-ai-result,
                         record-analysis-failure, get-report, get-report-markdown, sweep-stale-analyses),
                         analysis-watchdog.ts (los dos temporizadores), errors.ts (AnalysisNotFoundError, sin HTTP),
                         dto/ (tipos planos) y ports/ (ReportRepository, RetrievalClient)
src/infrastructure/      PostgresReportRepository e InMemoryReportRepository (guardan y devuelven Analysis),
                         mappers/analysis.mapper.ts (fila <-> entidad), HttpRetrievalClient (con breaker),
                         reports-startup.ts y db/ (esquema Drizzle, pool, migraciones)
src/http/                controlador delgado, mappers/ (contrato <-> DTO) y application-error.interceptor.ts
src/app.module.ts        composition root: enlaza puertos con adaptadores y registra el interceptor (ADR 0011)
drizzle/                 migraciones SQL generadas con `pnpm --filter @gyde/reports db:generate`
```

Las reglas de capas se comprueban con `pnpm exec eslint --config tooling/eslint/purity.config.mjs services/reports/src` (ADR 0012).

Los criterios de aceptación están como tests en `test/characterization.test.ts` (comportamiento externo fijado antes del refactor), `test/app.test.ts`, `test/analysis.test.ts` (la entidad, sin Nest ni BD), `test/contract-compat.test.ts` (los tipos del dominio y los DTO siguen siendo equivalentes a los contratos), `test/reports.mapper.test.ts`, `test/postgres-report-repository.test.ts`, `test/migrations.test.ts` y `test/report-decorator.test.ts`.

## Excepciones de contrato en application

Ninguna: `application/` no importa `@gyde/contracts`. Los DTO de `application/dto/analysis.dto.ts` son tipos planos con la misma forma que los mensajes del contrato.

## Comportamientos conocidos (conservados por el refactor)

Descripción factual de lo que el servicio hace hoy. El refactor no los cambia y cada uno está fijado por una prueba de caracterización (nombre del `it` entre comillas).

| # | Qué ocurre | Dónde | Prueba |
|---|---|---|---|
| R1 | Si la llamada a Retrieval lanza al crear, el análisis queda `failed` pero la respuesta `202` sigue diciendo `status: "retrieving"`; el cliente lo ve en el `GET`. | `application/create-analysis.ts` | `characterization.test.ts`: "keeps answering 202 "retrieving" when Retrieval throws, while the job is failed (the Error message is kept)" |
| R2 | `degradedReason` es el `reason` del fallo tal cual, sin comprobar que sea uno de los tres motivos de degradación: un fallo `stage: "llm"` con `reason: "retrieval-error"` sale así en el JSON y el banner del Markdown imprime `undefined`. La entidad tampoco comprueba que `reason` corresponda a `stage`. | `domain/report/build-report.ts`, `domain/analysis/analysis.ts` | "R2: a degradedReason is cast from failure.reason…"; `analysis.test.ts`: "does not check that the reason fits the stage" |
| R3 | Un fallo `llm` mientras el análisis sigue en `retrieving` (con IA esperada) lo cierra como `ready`, degradado y sin hallazgos; el resultado determinístico posterior se ignora. | `domain/analysis/analysis.ts` (`recordFailure`) | "R3: an llm failure while still retrieving…"; `analysis.test.ts`: "llm failure with AI expected: ready, from retrieving too…" |
| R4 | Un resultado de IA se guarda aunque no se esperara IA (`aiExpected = false`); al leer, la capa de IA se aplica según los `entitlements` del plan, no según `aiExpected`. | `domain/analysis/analysis.ts` (`recordAi`), `domain/report/compose-report.ts` | "R4: an AI result is stored even when AI was not expected…" |
| R5 | El temporizador de IA solo se arma cuando el resultado determinístico deja el análisis en `analyzing`; no se arma si no se esperaba IA ni si el resultado de IA llegó primero. | `application/record-deterministic-result.ts` | "R5: the AI watchdog is armed only when the deterministic result leaves the job analyzing" |
| R6 | `update` reescribe la fila completa (upsert) tras leer y modificar, sin bloqueo ni versión: una escritura construida con una lectura vieja pisa datos más nuevos. Además `updated_at` se toma del reloj real (`new Date()`), no del `now` inyectado. | `infrastructure/postgres-report.repository.ts` | "R6: update rewrites the whole row with no locking…" |
| R7 | Los temporizadores no se cancelan al cerrar la app ni se les hace `unref`. No hay prueba que lo fije. | `application/analysis-watchdog.ts`, `app.module.ts` | (ninguna) |

## Persistencia (schema `reports`)

- **Con `REPORTS_DATABASE_URL`**: `PostgresReportRepository` sobre el pool de `pg`. `ReportsStartup` aplica las migraciones de `drizzle/` (con *advisory lock*, idempotente) y después ejecuta el barrido de recuperación, todo antes de que el servicio escuche; `/readyz` responde `503` si la base no responde.
- **Sin la URL**: `InMemoryReportRepository`, sin migraciones ni barrido; los datos mueren con el proceso.
- `update` hace *upsert* sobre la misma fila del análisis y siempre refresca `updated_at`, el reloj que lee el barrido. No hay columnas `stage`, `degraded` ni `degradedReason`: se derivan al leer (`buildReport`).
- Los tests usan **PGlite** (`test/support/pglite.ts`), PostgreSQL en memoria con las migraciones de producción, para las migraciones, el repositorio y los casos de `app.test.ts` que necesitan base de datos.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `REPORTS_PORT` | 4500 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `REPORTS_DATABASE_URL` | — | Conexión a PostgreSQL (schema `reports`). **Opcional**: sin ella el repositorio es en memoria |
| `RETRIEVAL_URL` | `http://localhost:4300` | URL estática de respaldo si el registry no resuelve a Retrieval |
| `REPORTS_AI_TIMEOUT_MS` | 60000 | Espera máxima del resultado de IA |
| `REPORTS_RETRIEVAL_TIMEOUT_MS` | 90000 | Espera máxima de Retrieval tras aceptar el trabajo; pasado ese tiempo el análisis queda `failed` (`retrieval-error`). Mantenla por encima de la de IA |
