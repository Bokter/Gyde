# normalization: Pipeline de Normalización

Ingiere fuentes **heterogéneas** y las transforma en objetos de conocimiento (`KnowledgeObject`) con un **esquema común**, consultables por los demás servicios. Mantiene su información al día **de forma autónoma**: corre de manera periódica e indefinida, sin acoplarse al ciclo de vida del análisis.

> **Estado:** la persistencia (`KnowledgeRepository` sobre PostgreSQL y migraciones) está lista. Los adaptadores de fuentes, los casos de uso y la API siguen como esqueleto (501). Implementación: **Área 3** (`docs/tasks/area-3-conocimiento.md`).

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
                             (cvss.ts: puntaje base CVSS v3.0/3.1 a partir del vector, para fuentes que solo publican el vector, como OSV)
src/infrastructure/sources/  structured/ · official/ · community/  (un adaptador por fuente)
src/infrastructure/          repositorio PostgreSQL (db/: esquema Drizzle y migraciones) y planificador (cron)
src/http/                    controladores NestJS (ya declarados como stubs 501)
src/app.module.ts            composition root: enlaza puertos con adaptadores (ADR 0011)
```

## Reglas

- Cada llamada a una fuente externa va detrás de un **Circuit Breaker**: una fuente caída no detiene a las demás y se sigue sirviendo el conocimiento ya almacenado.
- Con `INGEST_USE_FIXTURES=true` (por defecto) lee de `fixtures/sources/` y **nunca toca la red**: así se desarrolla y se hace la demo sin depender de internet.
- La ingesta es **idempotente** (se actualiza por `id`).

## Persistencia

El repositorio (`PostgresKnowledgeRepository`) vive en el schema `normalization` y se conecta con el rol `normalization` (ADR 0009). Tablas:

| Tabla | Para qué |
|---|---|
| `knowledge_objects` | un `KnowledgeObject` por fila, con clave `id` (`"<fuente>:<id en la fuente>"`) |
| `knowledge_packages` | índice de `affected`: una fila por (objeto, ecosistema, nombre en minúsculas). Hace consultable por paquete sin recorrer JSON |
| `ingestion_runs` | cada intento de ingesta (éxito o fallo): de ahí salen `lastIngestedAt` y `GET /internal/sources` |
| `schema_migrations` | migraciones ya aplicadas, con su suma de verificación |

- `upsertMany` es **idempotente** y atómico (una transacción por llamada): re-ingestar actualiza por `id`, nunca duplica, y un registro que deja de mencionar un paquete deja de coincidir con él. Si un lote repite un `id`, gana el último.
- `query` devuelve los objetos que **mencionan** algún paquete pedido (mismo ecosistema y mismo nombre, sin distinguir mayúsculas), **sin filtrar por versión**. `kinds` y `gameEngine` solo acotan (un objeto sin motores aplica a todos). Orden estable por `id` y `limit`.
- `lastIngestedAt` es el fin de la última ingesta **exitosa** de la fuente: una fuente caída conserva su última hora buena.

### Migraciones

- El SQL se genera con drizzle-kit y se versiona en `drizzle/`: `pnpm --filter @gyde/normalization db:generate` (no necesita base de datos). Tras generarlo, quita el prefijo `"public".` que drizzle-kit pone en la llave foránea (ver `schema.ts`).
- Se aplican **al arrancar, antes de escuchar**, con el rol del servicio, y son idempotentes. Usamos un ejecutor propio (`infrastructure/db/migrate.ts`) en lugar del migrador de Drizzle porque este ejecuta `CREATE SCHEMA IF NOT EXISTS`, que el rol `normalization` no puede (no tiene `CREATE` sobre la base, por diseño). El ejecutor aplica todo bajo un candado consultivo (varias instancias a la vez no se pisan) y se niega a arrancar si una migración ya aplicada fue editada: crea una nueva en su lugar.
- Las pruebas usan PGlite (PostgreSQL en memoria, sin Docker ni red) con las mismas migraciones.

## Configuración

Ver `src/config.ts`. Las variables están documentadas en `.env.example` (`INGEST_*`, `OSV_API_URL`, `NVD_API_URL`, `NVD_API_KEY`, `GITHUB_TOKEN`, `NORMALIZATION_DATABASE_URL`, obligatoria para arrancar).
