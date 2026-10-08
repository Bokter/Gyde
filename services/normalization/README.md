# normalization: Pipeline de Normalización

Ingiere fuentes **heterogéneas** y las transforma en objetos de conocimiento (`KnowledgeObject`) con un **esquema común**, consultables por los demás servicios. Mantiene su información al día **de forma autónoma**: corre de manera periódica e indefinida, sin acoplarse al ciclo de vida del análisis.

> **Estado:** esqueleto ejecutable (501) con los **puertos** que estructuran el trabajo. Implementación: **Área 3** (`docs/tasks/area-3-conocimiento.md`).

- Puerto: `NORMALIZATION_PORT` (4200) · Solo red interna (`/internal/*` exige `x-internal-token`).
- Datos propios: schema `normalization` de PostgreSQL. Nadie más lee esas tablas: se consulta por la API.

## Fuentes y niveles de confianza (documento de arquitectura)

| Nivel (`SourceKind`) | Fuentes | Confianza | Cadencia |
|---|---|---|---|
| `structured` | CVE · GHSA · OSV · NVD | alta | `INGEST_HIGH_TRUST_CRON` (cada hora) |
| `official` | Documentación y *changelogs* de los motores (Unity, Unreal) | media/alta | según la fuente |
| `community` | GitHub Issues, foros | baja: procesamiento más liviano | `INGEST_COMMUNITY_CRON` (diaria) |

> Un CVE no se estructura igual que un GitHub Issue: el riesgo de este servicio es mantener esquemas consistentes para fuentes muy distintas. Por eso el esquema común vive en `@gyde/contracts` y cada fuente tiene su adaptador.

## API interna

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /internal/knowledge/query` | `KnowledgeQuery` | `KnowledgeQueryResult` (objetos que **mencionan** los paquetes pedidos) |
| `GET /internal/sources` | — | estado de cada fuente (última ingesta, errores) |
| `POST /internal/ingest/:source` | — | dispara una ingesta manual |

El cruce **dependencia/versión** (¿esta versión cae en el rango afectado?) lo hace **Retrieval**, no este servicio: aquí se devuelven los candidatos por ecosistema y nombre.

## Estructura (arquitectura limpia)

```
src/application/ports/       SourceAdapter y KnowledgeRepository (ya definidos)
src/application/             casos de uso: IngestSource, QueryKnowledge, ScheduleIngestion
src/domain/                  reglas puras de normalización y deduplicación
src/infrastructure/sources/  structured/ · official/ · community/  (un adaptador por fuente)
src/infrastructure/          repositorio PostgreSQL y planificador (cron)
src/http/                    rutas (ya declaradas como stubs)
```

## Reglas

- Cada llamada a una fuente externa va detrás de un **Circuit Breaker**: una fuente caída no detiene a las demás y se sigue sirviendo el conocimiento ya almacenado.
- Con `INGEST_USE_FIXTURES=true` (por defecto) lee de `fixtures/sources/` y **nunca toca la red**: así se desarrolla y se hace la demo sin depender de internet.
- La ingesta es **idempotente** (se actualiza por `id`).

## Configuración

Ver `src/config.ts`. Las variables están documentadas en `.env.example` (`INGEST_*`, `OSV_API_URL`, `NVD_API_URL`, `NVD_API_KEY`, `GITHUB_TOKEN`, `NORMALIZATION_DATABASE_URL`).
