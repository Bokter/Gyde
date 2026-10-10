# Área 3: Conocimiento (Normalización + Retrieval)

> **Responsable:** _(asignar)_ · Lee primero el [plan del equipo](00-resumen.md).

## Objetivo

Convertir **fuentes heterogéneas** (CVE, GHSA, OSV, NVD, documentación y *changelogs* de los motores, GitHub Issues) en **conocimiento consultable** con un esquema común (`services/normalization`), y **cruzarlo con el proyecto del cliente** de forma **determinística** (`services/retrieval`). Es el corazón del valor del producto: lo que detecta Gyde sin IA.

Dos servicios grandes. Empieza por el camino real mínimo (OSV + vulnerabilidades + licencias) y deja el resto como esqueleto con *fixtures*.

## Lecturas obligatorias

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) · [Visión general](../architecture/00-vision-general.md) · [Flujos](../architecture/02-flujos.md) (1) · [Patrones](../architecture/03-patrones.md) (Template Method de los analizadores) · [fixtures/README](../../fixtures/README.md) (qué resultado se espera) · README de `services/normalization`, `services/retrieval` y `packages/contracts` (`KnowledgeObject`, `Finding`, `DeterministicResult`).

## Qué construyes y cómo está hoy

| Módulo | Estado hoy | Tu trabajo |
|---|---|---|
| `services/normalization` | Stubs `501`, puertos `SourceAdapter` y `KnowledgeRepository` definidos | Adaptadores por fuente, persistencia, planificador, API |
| `services/retrieval` | Stub `501`; `BaseAnalyzer` (Template Method) hecho y probado; analizadores y caso de uso TODO | Los tres analizadores, `RetrieveEvidence`, adaptadores |

## Archivos

**Sí tocas:** `services/normalization/**` · `services/retrieval/**` · `fixtures/sources/**` (amplía, explicando en `fixtures/README.md`).

**No tocas:** el resto de servicios y `apps/**`. Los *fixtures* de proyectos (`fixtures/projects/**`) son del Área 4. Para `packages/contracts` abre un PR pequeño y pide revisión a otra área.

## Contratos

`KnowledgeObject`, `KnowledgeQuery`, `KnowledgeQueryResult`, `SourceKind`, `Trust`, `AffectedRange`, `RetrieveRequest`, `DeterministicResult`, `LlmAnalysisRequest`, `AnalysisFailure`, `Finding`, `Evidence`, `Entitlements`, `ROUTES.normalization.*`, `ROUTES.retrieval.*`.

## Entregables y criterios de aceptación

### Normalización (días 1 a 3)

- [ ] **Base de datos** (schema `normalization`, `NORMALIZATION_DATABASE_URL`, migraciones; Drizzle recomendado): `knowledge_objects` (con `affected` y `aliases` consultables por ecosistema + nombre) e `ingestion_runs`. Implementación de `KnowledgeRepository`: **`upsertMany` idempotente**, `query`, `lastIngestedAt`.
- [ ] **Adaptador OSV** (`structured`, confianza alta), **real**: lee `fixtures/sources/osv/*` con `INGEST_USE_FIXTURES=true` y la API (`OSV_API_URL`) en caso contrario; normaliza ecosistemas (`NuGet` → `nuget`), rangos `introduced`/`fixed`/`lastAffected`, severidad y CVSS.
- [ ] **Adaptadores NVD y GHSA** (`structured`): con *fixtures*, misma forma normalizada (el NVD cubre las librerías C++ por CPE).
- [ ] **Adaptador oficial** (`official`): notas de versión de Unity (`fixtures/sources/official/`) → conocimiento de tipo `changelog`/`documentation` con `gameEngines`. Unreal como esqueleto.
- [ ] **Adaptador de comunidad** (`community`): GitHub Issues (`fixtures/sources/community/`) → confianza **baja**, procesamiento liviano; nunca produce un hallazgo por sí solo.
- [ ] **Planificador**: alta frecuencia para `structured` (`INGEST_HIGH_TRUST_CRON`), otra cadencia para `community` (`INGEST_COMMUNITY_CRON`); ingesta manual con `POST /internal/ingest/:source`.
- [ ] **Resiliencia**: cada llamada a una fuente externa va detrás de un Circuit Breaker (`@gyde/resilience`, del Área 1); una fuente caída no detiene a las demás y se sigue sirviendo el conocimiento almacenado.
- [ ] API: `POST /internal/knowledge/query` (candidatos por ecosistema y nombre, **sin filtrar por versión**) y `GET /internal/sources` (última ingesta y estado).
- [ ] Todos los `it.todo` de `services/normalization/test/app.test.ts` convertidos y verdes. Con `INGEST_USE_FIXTURES=true` **no se toca la red**.

### Retrieval (días 2 a 4)

- [ ] **`VulnerabilityAnalyzer`**: cruce dependencia + versión con una **comparación de versiones real** por ecosistema (NuGet y UPM son tipo SemVer; admite versiones de 4 partes de NuGet), rangos `introduced`/`fixed`/`lastAffected`/`versions`, coincidencia por **ecosistema y nombre**. El hallazgo trae evidencia, impacto y recomendación (actualizar a la versión corregida).
- [ ] **`LicenseAnalyzer`**: parseo de expresiones **SPDX** (`MIT OR Apache-2.0`, `GPL-3.0-only AND MIT`…, por ejemplo con `spdx-expression-parse`) y una tabla de compatibilidad como **datos**; marca *copyleft* fuerte frente a distribución propietaria, licencias desconocidas o ausentes (informativo).
- [ ] **`CompatibilityAnalyzer`**: reglas sobre motor + SDK + plataforma a partir del conocimiento oficial (`fixtures/sources/official`); mínimo viable con un par de reglas curadas.
- [ ] **Caso de uso `RetrieveEvidence`**: consulta a normalization → ejecuta los analizadores que permite el plan (`licenseCompliance`, `compatibilityAnalysis`) → publica **`DeterministicResult` a Reports** → si el plan permite IA y el cliente la pidió, envía `LlmAnalysisRequest` a llm-analysis → ante error propio publica `AnalysisFailure` (`retrieval-error`), y si **llm-analysis no responde** o su breaker está abierto publica `AnalysisFailure` con `stage: 'llm'` y `reason: 'llm-unavailable'` (eres el único que se entera si ese servicio está apagado). Con normalization degradado, `partialSources: true`.
- [ ] **Adaptadores** `KnowledgeSource`, `ReportsClient` y `LlmClient` (HTTP, con breaker y discovery) y el handler `POST /internal/retrieve` que responde **`202` al instante** y trabaja en segundo plano.
- [ ] **Resultado exacto** sobre `sampleAnalysisRequest` + fixtures: el hallazgo de `Acme.Serialization 1.4.0` (SAMPLE-0001, alta, CVSS 7.5) y el de `Acme.GplToolkit` (GPL), y **ninguno** por `SAMPLE-0002` ni `SAMPLE-0003` (ver `fixtures/README.md`).
- [ ] El análisis es **determinístico**: misma entrada, misma salida y mismo orden (el `prioritize` de `BaseAnalyzer` ya lo garantiza).
- [ ] Todos los `it.todo` de `services/retrieval/test/base-analyzer.test.ts` convertidos y verdes.

## Dependencias con otras áreas

| Necesitas | De | Mientras tanto |
|---|---|---|
| `CircuitBreaker` y caché | Área 1 (fin del día 1) | Interfaz tipada de `@gyde/resilience`; llama directo con un envoltorio mínimo |
| `RegistryClient` / `ResilientHttpClient` | Área 1 (día 2) | URLs estáticas `NORMALIZATION_URL`, `LLM_ANALYSIS_URL`, `REPORTS_URL` |
| `POST /internal/analyses/:id/deterministic` de Reports | Área 4 | Servidor simulado que valida `DeterministicResult` |
| `POST /internal/analyze` de llm-analysis | Área 4 | Servidor simulado que valida `LlmAnalysisRequest` |

| Entregas | A quién | Cuándo |
|---|---|---|
| Retrieval publicando `DeterministicResult` | Área 4 (Reports) | **Día 3** |
| Conocimiento de OSV consultable | Retrieval (tú misma/o) | Día 2 |

## Orden sugerido

1. **Día 1:** esquema y repositorio, adaptador OSV con *fixtures*, `VulnerabilityAnalyzer` (lógica de versiones pura y probada).
2. **Día 2:** API de normalization, `RetrieveEvidence` con puertos falsos, `LicenseAnalyzer`.
3. **Día 3:** adaptadores HTTP de Retrieval y publicación a Reports; NVD/GHSA; planificador.
4. **Día 4:** integración E2E; compatibilidad y adaptadores oficial/comunidad.
5. **Día 5:** pulido, robustez de la ingesta y documentación.

## Si hay retraso

Compatibilidad con 2 o 3 reglas · documentación y comunidad como esqueleto con *fixtures* · NVD y GHSA solo con *fixtures* · sin planificador real (ingesta manual al arrancar) · sin API real de OSV (solo *fixtures*).

## Prompt para tu asistente

El prompt completo (contexto, arquitectura, patrones, reglas de coherencia entre documentos y código, flujo con `dev` y los detalles de esta área) está en [`prompts/prompt-area-3-conocimiento.md`](prompts/prompt-area-3-conocimiento.md). Pégalo al empezar tu sesión con Claude.
