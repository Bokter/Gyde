# reports: Servicio de Reportes

**Consolida** lo determinístico (Retrieval) y lo producido por el LLM en un **reporte de riesgo priorizado y explicable** (evidencia, impacto, recomendación). Es el **orquestador** del análisis: crea el trabajo, pide la evidencia a Retrieval y arma el reporte final.

> **Estado:** `POST /internal/analyses` y `GET /internal/analyses/:id` **en vivo** (repositorio en memoria, cliente HTTP de Retrieval con Circuit Breaker). Decorator (base hecha); decoradores concretos, transiciones `record*`, persistencia PostgreSQL y render Markdown: **Área 4** (`docs/tasks/area-4-motor-llm-y-reportes.md`).

- Puerto: `REPORTS_PORT` (4500) · Solo red interna (el gateway es su cliente).
- Datos propios: schema `reports` de PostgreSQL.
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

## Ciclo de vida (`AnalysisLifecycle`)

```
create ──▶ pending ──▶ retrieving ──▶ analyzing ──▶ ready
                              │             │
                              └─(sin IA)────┼──────▶ ready
                                            └─(falla de IA)──▶ ready + degraded
retrieval-error ──▶ failed
```

- Un reporte es **degradado** solo si se esperaba IA y no pudo correr (`llm-unavailable`, `llm-not-configured`, `llm-error`). Si el plan o el cliente no pidieron IA, **no** es degradado.
- Nunca se queda colgado: si el resultado de IA no llega en `REPORTS_AI_TIMEOUT_MS`, pasa a `ready` y degradado.
- Si Retrieval no responde al crear el trabajo, este queda `failed` con un error claro y el `202` se responde igualmente (el cliente lo ve en el `GET`).

## Formato del Markdown (`renderMarkdown`)

1. Título con el id del análisis y la fecha.
2. Aviso de **degradado** (solo si lo es): qué falta (la explicación de IA) y por qué (`llm-unavailable`, `llm-not-configured` o `llm-error`), y que los hallazgos siguen siendo válidos.
3. Resumen: conteo por severidad y `riskScore` (si la capa de severidad corrió).
4. Hallazgos ordenados por severidad (luego CVSS): cada uno con título, paquete y versión, **evidencia**, **impacto** y **recomendación**, y su explicación de IA cuando exista.

## API interna

| Método y ruta | Cuerpo | Respuesta | Estado |
|---|---|---|---|
| `POST /internal/analyses` | `CreateAnalysisJob` | `202 AnalysisAccepted` | **en vivo** |
| `GET /internal/analyses/:analysisId` | — | `Report` | **en vivo** |
| `GET /internal/analyses/:analysisId/markdown` | — | `text/markdown` | stub 501 |
| `POST /internal/analyses/:analysisId/deterministic` | `DeterministicResult` | `204` (desde Retrieval) | stub 501 |
| `POST /internal/analyses/:analysisId/ai-result` | `AiResult` | `204` (desde llm-analysis) | stub 501 |
| `POST /internal/analyses/:analysisId/failure` | `AnalysisFailure` | `204` | stub 501 |

## Estructura

```
src/domain/report/       Decorator (hecho) y composeReport, decoradores, renderMarkdown (TODO)
src/application/         AnalysisLifecycle (create/get hechos; record* TODO) y puertos
src/infrastructure/      InMemoryReportRepository y HttpRetrievalClient (con breaker)
src/http/                controlador NestJS (create/get en vivo; resto stubs 501)
src/app.module.ts        composition root: enlaza puertos con adaptadores (ADR 0011)
```

Los criterios de aceptación están como `it.todo` en `test/app.test.ts` y `test/report-decorator.test.ts`.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `REPORTS_PORT` | 4500 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `REPORTS_DATABASE_URL` | — | Conexión al schema `reports` |
| `RETRIEVAL_URL` | — | URL estática de respaldo si el registry no resuelve |
| `REPORTS_AI_TIMEOUT_MS` | 60000 | Espera máxima del resultado de IA |
