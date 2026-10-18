# normalization: Pipeline de Normalización

Ingiere fuentes **heterogéneas** y las transforma en objetos de conocimiento (`KnowledgeObject`) con un **esquema común**, consultables por los demás servicios. Mantiene su información al día **de forma autónoma**: corre de manera periódica e indefinida, sin acoplarse al ciclo de vida del análisis.

> **Estado:** la API interna, la persistencia y el adaptador OSV están listos. Faltan los adaptadores NVD, GHSA, oficial y comunidad y el planificador por cadencia. Implementación: **Área 3** (`docs/tasks/area-3-conocimiento.md`).

- Puerto: `NORMALIZATION_PORT` (4200) · Solo red interna (`/internal/*` exige `x-internal-token`).
- Datos propios: schema `normalization` de PostgreSQL. Nadie más lee esas tablas: se consulta por la API.

## Fuentes y niveles de confianza (documento de arquitectura)

| Nivel (`SourceKind`) | Fuentes | Confianza | Cadencia |
|---|---|---|---|
| `structured` | CVE · GHSA · OSV · NVD | alta | `INGEST_HIGH_TRUST_CRON` (cada hora) |
| `official` | Documentación y *changelogs* de los motores (Unity, Unreal) | media/alta | según la fuente |
| `community` | GitHub Issues, foros | baja: procesamiento más liviano | `INGEST_COMMUNITY_CRON` (diaria) |

**Adaptador OSV (`infrastructure/sources/structured/osv.adapter.ts`):** con fixtures lee `fixtures/sources/osv/*.json`; en modo real consulta el listado de cambios del bucket de OSV (`OSV_BUCKET_URL`) y cada aviso en `OSV_API_URL`, siempre detrás de un Circuit Breaker (en la primera ingesta toma solo los últimos 30 días). La transformación es pura (`domain/osv-normalizer.ts`): cada par `introduced` → `fixed`/`last_affected` es un rango, `database_specific.severity` manda sobre el puntaje CVSS (calculado con `domain/cvss.ts`), y `aliases` incluye el id del propio aviso. Se omiten los avisos retirados y los de ecosistemas que Gyde no cubre (solo NuGet por ahora).

> Un CVE no se estructura igual que un GitHub Issue: el riesgo de este servicio es mantener esquemas consistentes para fuentes muy distintas. Por eso el esquema común vive en `@gyde/contracts` y cada fuente tiene su adaptador.

## API interna

Todo `/internal/*` exige `x-internal-token` y nunca pasa por el gateway.

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /internal/knowledge/query` | `KnowledgeQuery` | `200` `KnowledgeQueryResult`: objetos que **mencionan** los paquetes pedidos (mismo ecosistema y nombre), sin filtrar por versión |
| `GET /internal/sources` | — | `200` `SourcesStatus`: por fuente, `status` (`never` / `ok` / `failed`), última ingesta exitosa, último intento y último error |
| `POST /internal/ingest/:source` | — | `200` `IngestResult` al terminar la ingesta · `404` fuente desconocida · `409` ya hay una ingesta de esa fuente en curso · `503` la fuente falló (el intento queda registrado) |

- La ingesta es **incremental**: pide a la fuente lo cambiado desde la última ingesta **exitosa**. Un registro mal formado se omite y se cuenta (`recordsSkipped`) sin detener el resto de la fuente.
- Una fuente caída falla sola: las demás se ingieren y lo ya almacenado se sigue sirviendo.
- `GET /healthz` es liveness; `GET /readyz` responde `503` mientras la base de datos no contesta.

El cruce **dependencia/versión** (¿esta versión cae en el rango afectado?) lo hace **Retrieval**, no este servicio: aquí se devuelven los candidatos por ecosistema y nombre.

## Estructura (arquitectura limpia)

```
src/domain/entities/         knowledge-object.entity.ts: KnowledgeObject y sus tipos auxiliares. Es un tipo plano
                             (valor inmutable), no una clase con comportamiento
src/domain/repositories/     knowledge.repository.ts: contrato KnowledgeRepository (interface + token
                             KNOWLEDGE_REPOSITORY), IngestionRun y KnowledgeCriteria (criterios de consulta)
src/domain/                  reglas puras, sin imports externos: OsvRecordInput, osv-normalizer.ts
                             (aviso OSV -> KnowledgeObject), cvss.ts (puntaje base CVSS v3.0/3.1 a partir
                             del vector) e InvalidRecordError
src/application/use-cases/   *.use-case.ts: IngestSourceUseCase, QueryKnowledgeUseCase, ListSourcesUseCase
src/application/             errors.ts (NormalizationError y subclases, sin HTTP) y dto/ (tipos planos;
                             KnowledgeQueryDto es un alias de KnowledgeCriteria)
src/application/ports/       SourceAdapter (fuente de datos externa; habla en entidades y DTO)
src/infrastructure/repositories/ postgres-knowledge.repository.ts: implementación PostgreSQL del contrato
src/infrastructure/          mappers/ (fila <-> entidad), db/ (esquema Drizzle y migraciones)
src/infrastructure/sources/  structured/ (OSV: adaptador y osv-record.schema.ts con el Zod del registro) ·
                             official/ y community/ (vacías, sin adaptadores todavía)
src/http/                    controlador delgado, mappers/ (contrato <-> DTO) y application-error.interceptor.ts
src/app.module.ts            composition root: enlaza contratos y puertos con adaptadores (ADR 0011)
```

- El dominio no importa `@gyde/*`, `zod` ni `node:*`. El normalizador OSV recibe un registro ya validado (`OsvRecordInput`) y un predicado `isUrl`; la validación Zod del registro y la del contrato `KnowledgeObject` ocurren en `OsvAdapter.normalize` (infraestructura).
- Los errores de aplicación (fuente desconocida, ingesta en curso, ingesta fallida) los traduce `ApplicationErrorInterceptor` (`APP_INTERCEPTOR`) a `HttpError`: 404 `not_found`, 409 `conflict`, 503 `upstream_unavailable` con `details: { source }`. El sobre `ApiError` lo sigue produciendo el filtro global de `service-kit`.

## Excepciones de contrato en application

Ninguna: `application/` no importa `@gyde/contracts`.

## Comportamientos conocidos

Se conservan tal cual (el refactor no cambia comportamiento); quedan registrados para revisarlos después:

- **Doble validación.** Un aviso OSV se valida dos veces: el esquema del registro (`osv-record.schema.ts`) y luego el contrato `KnowledgeObject` (en `OsvAdapter.normalize`). Lo que el contrato rechaza (fechas mal formadas, `affected.name` de más de 200 caracteres) se cuenta como registro inválido (`recordsSkipped`). El repositorio vuelve a validar con el contrato al escribir y al leer una fila.
- **Un fixture sin `id` falla toda la ingesta** (`503`): el error sale del generador `fetchChanges`, no se cuenta como omitido.
- **Cualquier error de `normalize()` que no sea `InvalidRecordError` falla la ingesta** completa (`503`).
- **`official/` y `community/` están vacías** y hay 4 `it.todo` en `test/app.test.ts` (adaptadores NVD/GHSA, oficial, comunidad y cron).

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

## Límites conocidos

- **Avisos retirados.** Cuando una fuente retira un aviso (en OSV, el campo `withdrawn`), el adaptador **lo omite al ingerir y lo cuenta en `recordsSkipped`**, pero **no borra** la copia que ya se guardó antes: el contrato `KnowledgeRepository` no tiene operación de borrado. Mientras esa copia exista, `POST /internal/knowledge/query` la sigue devolviendo y Retrieval puede seguir marcando un aviso que la fuente ya reconoció como falso. Es una posible **fuente de falsos positivos**; la solución prevista es ampliar el contrato con un borrado (o con una marca de «retirado» que la consulta excluya) y que el adaptador la use.
- **Dependencias.** Normalization solo depende de PostgreSQL y de las fuentes que ingiere (cada una detrás de su Circuit Breaker). **No llama a Reports ni a ningún otro servicio**: quien la consulta es Retrieval, así que si normalization cae, el análisis sigue con la última respuesta guardada o sin conocimiento (`partialSources`) y no depende de que Reports lo sepa.

## Configuración

Ver `src/config.ts`. Las variables están documentadas en `.env.example` (`INGEST_*`, `OSV_API_URL`, `NVD_API_URL`, `NVD_API_KEY`, `GITHUB_TOKEN`, `NORMALIZATION_DATABASE_URL`, obligatoria para arrancar).
