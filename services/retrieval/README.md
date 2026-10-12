# retrieval: Servicio de Retrieval

Recupera la información pertinente por **tres vías** y la cruza con el proyecto del cliente. Dos de ellas son **determinísticas**: no usan IA y siguen funcionando aunque el proveedor de LLM falle.

> **Estado:** esqueleto ejecutable (501) con la **base del Template Method** de los analizadores implementada y probada. Analizadores y caso de uso: **Área 3** (`docs/tasks/area-3-conocimiento.md`).

- Puerto: `RETRIEVAL_PORT` (4300) · Solo red interna · Su único cliente es **Reports**.
- Origen en el documento: contenedor *Servicio de retrieval* ("Filtra evidencia relevante") y el "Servicio de Análisis (vulnerabilidad y licencias) determinístico".

## Las tres vías

| Analizador | Qué hace | Plan |
|---|---|---|
| `VulnerabilityAnalyzer` | Cruza dependencia + versión con los rangos afectados de los avisos (determinístico) | todos |
| `LicenseAnalyzer` | Compatibilidad de licencias SPDX (determinístico) | `licenseCompliance` |
| `CompatibilityAnalyzer` | Motor + SDK + plataforma contra documentación y *changelogs* | `compatibilityAnalysis` |

Viven como **módulos de este servicio** (no como tres microservicios), compartiendo el algoritmo de `BaseAnalyzer`: `select → match → toFinding → prioritize → evidencia`. `prioritize` es invariante (severidad, luego CVSS, luego título) y el análisis es **puro y síncrono**: misma entrada, misma salida.

## Flujo del caso de uso `RetrieveEvidence`

1. Reports llama `POST /internal/retrieve` y recibe `202` al instante.
2. Pide a **normalization** el conocimiento de los paquetes (detrás de un Circuit Breaker).
3. Ejecuta los analizadores que permite el plan.
4. Publica el **resultado determinístico** a Reports (`DeterministicResult`): desde aquí el reporte ya puede entregarse.
5. Si el plan permite IA y el cliente la pidió, envía la evidencia a **llm-analysis** (`LlmAnalysisRequest`).
6. Si algo falla, publica un `AnalysisFailure` en vez de colgarse.

## API interna

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /internal/retrieve` | `RetrieveRequest` | `202` (el trabajo sigue en segundo plano) |

## Estructura

```
src/domain/analyzers/    BaseAnalyzer (hecho) · vulnerabilities/ · compatibility/ · licenses/
src/application/         RetrieveEvidence y puertos: KnowledgeSource, ReportsClient, LlmClient
src/infrastructure/      adaptadores HTTP hacia normalization, reports y llm-analysis (con breaker)
src/http/                ruta (ya declarada como stub)
```

Los criterios de aceptación están como `it.todo` en `test/base-analyzer.test.ts`.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `RETRIEVAL_PORT` | 4300 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `NORMALIZATION_URL`, `LLM_ANALYSIS_URL`, `REPORTS_URL` | — | URLs estáticas de respaldo si el registry no resuelve (desarrollo local) |
