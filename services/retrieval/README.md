# retrieval: Servicio de Retrieval

Recupera la información pertinente por **tres vías** y la cruza con el proyecto del cliente. Dos de ellas son **determinísticas**: no usan IA y siguen funcionando aunque el proveedor de LLM falle.

> **Estado:** `BaseAnalyzer` y `VulnerabilityAnalyzer` (con la comparación de versiones por ecosistema) están implementados y probados. Faltan `LicenseAnalyzer`, `CompatibilityAnalyzer`, el caso de uso y los adaptadores (el endpoint sigue en 501). Implementación: **Área 3** (`docs/tasks/area-3-conocimiento.md`).

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
6. Si algo falla, publica un `AnalysisFailure` en vez de colgarse: `retrieval-error` si falla su propio trabajo, y `llm-unavailable` (etapa `llm`) si **llm-analysis no responde** o su Circuit Breaker está abierto (es el único que se entera cuando ese servicio está caído).

## API interna

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /internal/retrieve` | `RetrieveRequest` | `202` (el trabajo sigue en segundo plano) |

## Estructura

```
src/domain/analyzers/    BaseAnalyzer (hecho) · vulnerabilities/ (hecho) · compatibility/ · licenses/
src/domain/versions/     comparación de versiones por ecosistema y rangos afectados (puro)
src/application/         RetrieveEvidence y puertos: KnowledgeSource, ReportsClient, LlmClient
src/infrastructure/      adaptadores HTTP hacia normalization, reports y llm-analysis (con breaker)
src/http/                controladores NestJS (ya declarados como stubs 501)
src/app.module.ts        composition root: enlaza puertos con adaptadores (ADR 0011)
```

Los criterios de aceptación pendientes están como `it.todo` en `test/base-analyzer.test.ts`.

## Cruce de vulnerabilidades

- **Versiones** (`domain/versions/`): se comparan por número, no como texto (`1.10.0` > `1.9.0`). Las partes que faltan valen cero (`1.4` = `1.4.0`), NuGet admite cuatro partes, un *pre-release* es menor que su versión final y los metadatos de compilación (`+abc`) se ignoran. Una versión que no se puede interpretar (un rango declarado, un comodín) **nunca** produce un hallazgo.
- **Rangos** (estilo OSV): `introduced` es inclusivo (`0` o ausente = desde el inicio), `fixed` es el primer arreglo y **exclusivo** (`1.5.0` no es vulnerable con «fixed 1.5.0»), `lastAffected` es inclusivo, y `versions` es una lista explícita alternativa. La coincidencia exige **ecosistema y nombre** (sin distinguir mayúsculas).
- **Duplicados:** el mismo aviso publicado por varias fuentes (comparten un alias) es **un** hallazgo con la evidencia de cada fuente; se nombra por su CVE si lo tiene o, si no, por el identificador que más fuentes comparten. La recomendación es la versión corregida más alta entre las copias.
- Solo producen hallazgos los objetos de tipo `vulnerability` de fuentes que no son de comunidad.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `RETRIEVAL_PORT` | 4300 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `NORMALIZATION_URL`, `LLM_ANALYSIS_URL`, `REPORTS_URL` | — | URLs estáticas de respaldo si el registry no resuelve (desarrollo local) |
