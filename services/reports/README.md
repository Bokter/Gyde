# reports: Servicio de Reportes

**Consolida** lo determinístico (Retrieval) y lo producido por el LLM en un **reporte de riesgo priorizado y explicable** (evidencia, impacto, recomendación). Es el **orquestador** del análisis: crea el trabajo, pide la evidencia a Retrieval y arma el reporte final.

> **Estado:** esqueleto ejecutable (501) con la **estructura del Decorator** implementada y probada. Ciclo de vida, decoradores concretos, persistencia y render: **Área 4** (`docs/tasks/area-4-motor-llm-y-reportes.md`).

- Puerto: `REPORTS_PORT` (4500) · Solo red interna (el gateway es su cliente).
- Datos propios: schema `reports` de PostgreSQL.
- Origen en el documento: contenedor *Servicio de reportes* ("Reporte final priorizado") y el patrón **Decorator**.

## Patrón Decorator

| Participante (UML del PDF) | Código (`src/domain/report/`) |
|---|---|
| `ReportComponent` (Component) | `report-component.ts` |
| `BasicAnalysisReport` (ConcreteComponent) | `basic-analysis-report.ts` |
| `ReportDecorator` (Decorator) | `report-decorator.ts` |
| `SeverityScoreDecorator`, `LicenseComplianceDecorator`, `AIEnrichmentDecorator` | `decorators/*.decorator.ts` |
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

## API interna

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /internal/analyses` | `CreateAnalysisJob` | `202 AnalysisAccepted` |
| `GET /internal/analyses/:analysisId` | — | `Report` |
| `GET /internal/analyses/:analysisId/markdown` | — | `text/markdown` |
| `POST /internal/analyses/:analysisId/deterministic` | `DeterministicResult` | `204` (desde Retrieval) |
| `POST /internal/analyses/:analysisId/ai-result` | `AiResult` | `204` (desde llm-analysis) |
| `POST /internal/analyses/:analysisId/failure` | `AnalysisFailure` | `204` |

## Estructura

```
src/domain/report/       Decorator (hecho) y composeReport, decoradores, renderMarkdown (TODO)
src/application/         AnalysisLifecycle y puertos: ReportRepository, RetrievalClient
src/infrastructure/      repositorio PostgreSQL y cliente HTTP de Retrieval (con breaker)
src/http/                rutas (ya declaradas como stubs)
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
