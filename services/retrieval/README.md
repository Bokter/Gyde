# retrieval: Servicio de Retrieval

Recupera la información pertinente por **tres vías** y la cruza con el proyecto del cliente. Dos de ellas son **determinísticas**: no usan IA y siguen funcionando aunque el proveedor de LLM falle.

> **Estado:** `POST /internal/retrieve`, el caso de uso `RetrieveEvidence`, los adaptadores HTTP y los analizadores de vulnerabilidades y licencias están implementados y probados. Falta `CompatibilityAnalyzer` (su cobertura se informa como `false` mientras tanto). Implementación: **Área 3** (`docs/tasks/area-3-conocimiento.md`).

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
| `POST /internal/retrieve` | `RetrieveRequest` | `202` sin cuerpo, **al instante**; el trabajo sigue en segundo plano y el resultado viaja a Reports por su propio endpoint |

## Estructura

```
src/domain/              solo imports relativos (sin contratos, Zod, node:* ni librerías)
  model.ts               value objects de solo lectura: Dependency, AffectedRange, KnowledgeEntry, Evidence, Finding, Severity y SEVERITY_ORDER (copia local)
  ports.ts               puertos del dominio: LicenseExpressionParser (SPDX) y DigestHex (sha256 hex)
  analyzers/             BaseAnalyzer (Template Method, hecho) · vulnerabilities/ (hecho) · licenses/ (hecho) · compatibility/ (esqueleto)
  versions/              comparación de versiones por ecosistema y rangos afectados (puro)
src/application/         RetrieveEvidence, BackgroundJobs, errors.ts (RetrievalError con `code` y subclases, sin HTTP)
  dto/                   tipos planos de entrada/salida del caso de uso (retrieval.dto.ts)
  ports/                 KnowledgeSource, ReportsClient, LlmClient (hablan en DTO y tipos de dominio)
src/infrastructure/      adaptadores HTTP hacia normalization, reports y llm-analysis sobre `ResilientHttpClient` (discovery + `*_URL`, breaker por dependencia),
                         SpdxLicenseExpressionParser (spdx-expression-parse), sha256Hex (node:crypto) y mappers/ (contrato <-> DTO/dominio)
src/http/                controlador NestJS de `POST /internal/retrieve` y mappers/ (RetrieveRequest -> DTO)
src/app.module.ts        composition root: enlaza puertos con adaptadores y construye los analizadores con el parser y el digest (ADR 0011)
```

Los analizadores y los tipos de `domain/model.ts` son *value objects* y servicios de dominio (tipos planos de solo lectura con funciones puras), no entidades con ciclo de vida: Retrieval no guarda estado. Las reglas de capas se comprueban con `pnpm exec eslint --config tooling/eslint/purity.config.mjs services/retrieval/src` (ADR 0012).

### Errores y por qué no hay interceptor

`application/errors.ts` define `RetrievalError` (con `code`) y sus subclases `KnowledgeUnavailableError` y `LlmUnavailableError`. A diferencia de registry, **no hay `application-error.interceptor.ts`**: el controlador responde `202` y ningún error de aplicación llega a HTTP. `RetrieveEvidence.execute` los consume y los convierte en un `AnalysisFailure` publicado a Reports (o en una llamada a `onError`). El `400`/`401` los producen el pipe Zod y el guard de `service-kit`, que no cambian.

## Excepciones de contrato en application

Ninguna: ningún archivo de `application/` importa `@gyde/contracts`. Los puertos y el caso de uso hablan en DTOs (`application/dto/`) y en tipos de `domain/model.ts`; los mappers de `http/mappers/` e `infrastructure/mappers/` convierten desde y hacia los contratos.

## Comportamientos conocidos

Se describen tal como son hoy; el refactor no los cambió.

- `CompatibilityAnalyzer` es un esqueleto: sus pasos lanzan `TODO(area-3)` y no se instancia en `app.module.ts`. Por eso `coverage.compatibility` es `false` siempre, aunque el plan tenga `compatibilityAnalysis`.
- La clave del caché de respaldo de normalization es el sha256 de `JSON.stringify` de la consulta: depende del orden de claves (`packages`, `gameEngine`, `limit`) y del orden de los paquetes (el de primera aparición en la solicitud).
- Los ids de hallazgo son deterministas y legibles (`license:<eco>:<nombre>@<versión>`, `vuln:<alias>:<eco>:<nombre>@<versión>`). Si superan 100 caracteres se reemplazan por `<prefijo>:` + los 40 primeros caracteres hex del sha256 de la forma legible. El de licencia no incluye la licencia ni el alias, y el de vulnerabilidad hasheado pierde el alias.
- Los analizadores no deduplican dependencias: una dependencia repetida en la solicitud produce hallazgos con el mismo id (solo la consulta a normalization deduplica).
- La consulta a normalization usa siempre `limit: 5000` y no envía `kinds`.
- El orden de los hallazgos usa `localeCompare(..., 'en')` (título e id), así que depende de ICU de Node.
- La razón `llm-not-configured` existe en el contrato pero Retrieval nunca la publica.
- `rxjs`, `@nestjs/core`, `@nestjs/platform-fastify`, `pino` y `reflect-metadata` figuran en `package.json` pero `src/` no los importa directamente.

Los criterios de aceptación pendientes (`CompatibilityAnalyzer`) están como `it.todo` en `test/base-analyzer.test.ts`.

## Cómo se comporta `RetrieveEvidence`

- **Plan:** `vulnerabilities` corre en todos los planes; `licenses` exige `licenseCompliance` y `compatibility` exige `compatibilityAnalysis`. `coverage` del resultado dice qué analizadores corrieron de verdad.
- **Un solo orden:** los hallazgos de todos los analizadores se mezclan con la misma regla (severidad, CVSS, título, id): mismo conjunto de conocimiento, mismo resultado y mismo orden.
- **Publica el resultado determinístico a Reports antes de tocar la IA.** Solo envía a llm-analysis si el plan permite IA **y** el cliente la pidió (`options.includeAi`).
- **Normalization degradado:** si no responde (caído, circuito abierto) se sirve la última respuesta guardada para la misma consulta o, si no hay, se sigue sin conocimiento; en ambos casos `partialSources: true`. Eso **no** hace degradado al reporte y los análisis que no necesitan conocimiento (licencias) siguen funcionando.
- **Errores propios** (respuesta inválida de normalization, un 4xx, un fallo del análisis): `AnalysisFailure` con `retrieval-error`; el mensaje es fijo y no incluye detalles internos.
- **llm-analysis caído** (sin respuesta, 5xx o circuito abierto): `AnalysisFailure` con `stage: 'llm'` y `reason: 'llm-unavailable'`; el resultado determinístico ya estaba publicado. Si llm-analysis rechaza la solicitud (4xx): `llm-error`.
- **Reports no contesta:** reintenta unos segundos (3 intentos). Si no se puede entregar nada, lo registra en el log y no se cae.

## Llamadas salientes

Toda llamada pasa por el `ResilientHttpClient` de `@gyde/service-kit`: la dirección sale de **discovery** (`REGISTRY_URL`; las `NORMALIZATION_URL`, `LLM_ANALYSIS_URL` y `REPORTS_URL` solo como respaldo cuando el registry no responde o no hay instancia sana, y las únicas que se usan si `REGISTRY_URL` no está definida), hay un **Circuit Breaker por dependencia** (`CB_*`) y se envía `x-internal-token`. Los adaptadores traducen lo que lanza el cliente: una **caída** (sin instancia, circuito abierto, tiempo agotado, red, 5xx) es `ServiceUnavailableError`; un **4xx** (`HttpError`) es un rechazo, no cuenta como caída del servicio y no se reintenta.

## Cruce de vulnerabilidades

- **Versiones** (`domain/versions/`): se comparan por número, no como texto (`1.10.0` > `1.9.0`). Las partes que faltan valen cero (`1.4` = `1.4.0`), NuGet admite cuatro partes, un *pre-release* es menor que su versión final y los metadatos de compilación (`+abc`) se ignoran. Una versión que no se puede interpretar (un rango declarado, un comodín) **nunca** produce un hallazgo.
- **Rangos** (estilo OSV): `introduced` es inclusivo (`0` o ausente = desde el inicio), `fixed` es el primer arreglo y **exclusivo** (`1.5.0` no es vulnerable con «fixed 1.5.0»), `lastAffected` es inclusivo, y `versions` es una lista explícita alternativa. La coincidencia exige **ecosistema y nombre** (sin distinguir mayúsculas).
- **Duplicados:** el mismo aviso publicado por varias fuentes (comparten un alias) es **un** hallazgo con la evidencia de cada fuente; se nombra por su CVE si lo tiene o, si no, por el identificador que más fuentes comparten. La recomendación es la versión corregida más alta entre las copias.
- Solo producen hallazgos los objetos de tipo `vulnerability` de fuentes que no son de comunidad.

## Cruce de licencias

La política es para un juego que se distribuye como **producto propietario**. La tabla de qué significa cada licencia es **datos** (`domain/analyzers/licenses/license-policy.ts`); el analizador solo la lee.

| Clase | Ejemplos | Hallazgo |
|---|---|---|
| permisiva | MIT, Apache-2.0, BSD, ISC, Zlib | ninguno |
| copyleft débil | LGPL, MPL-2.0, EPL | `low` (revisar cómo se enlaza; los *builds* estáticos como IL2CPP o consolas piden más cuidado) |
| copyleft fuerte | GPL, EUPL, OSL | `medium` |
| copyleft de red | AGPL, SSPL | `high` (también aplica al ofrecer un servidor por red) |

- **Expresiones SPDX** (`spdx-expression-parse`): `OR` deja elegir al licenciatario, así que cuenta la alternativa menos restrictiva; `AND` suma obligaciones, así que cuenta la más restrictiva. `WITH` una excepción de enlace (p. ej. `Classpath-exception-2.0`) baja el copyleft un nivel. Se entienden `+`, los paréntesis y los identificadores obsoletos (`GPL-3.0`).
- **Combinaciones incompatibles** unidas por `AND` (p. ej. `GPL-2.0-only AND Apache-2.0`): `high`.
- **Licencia que no se puede clasificar** (no es SPDX, o es válida pero sin política): `info`, nunca «todo bien» en silencio. **Licencia ausente**: `info` solo para NuGet; los paquetes UPM no la declaran en su manifiesto, así que su ausencia no dice nada.
- El *gate* del plan (`licenseCompliance`) lo aplica el caso de uso, no el analizador.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `RETRIEVAL_PORT` | 4300 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `REGISTRY_URL` | — | El Service Registry (discovery). Sin ella solo se usan las URLs estáticas |
| `NORMALIZATION_URL`, `LLM_ANALYSIS_URL`, `REPORTS_URL` | — | URLs estáticas de respaldo si el registry no resuelve (desarrollo local) |

## Dependencia de Reports y límites conocidos

Retrieval **no guarda estado**: lo que calcula solo existe hasta que Reports lo recibe.

- **Si Reports no contesta**, el resultado determinístico se reintenta (3 intentos con espera corta, siempre detrás del breaker). Si sigue sin entregarse, se intenta avisar con un `AnalysisFailure` (`retrieval-error`) y, si tampoco se puede, queda **solo en el log** del servicio. Retrieval no se cae ni bloquea a nadie: responde `202` y trabaja en segundo plano.
- **Un 4xx de Reports** (p. ej. `404` por un análisis que no existe) no se reintenta: reintentar fallaría igual.
- **Un análisis puede quedarse en `retrieving`.** Reports solo arranca su temporizador (`REPORTS_AI_TIMEOUT_MS`) cuando el análisis pasa a `analyzing`. Si Retrieval aceptó la solicitud (`202`) pero no logra entregar ni el resultado ni el fallo —o el proceso se reinicia a mitad de trabajo—, Reports no recibe nada y el análisis queda en `retrieving` para siempre. Retrieval no puede resolverlo solo (no tiene dónde guardar el trabajo pendiente): hace falta un temporizador para el estado `retrieving` en Reports. **Pendiente del Área 4.**
- **El análisis con IA depende de llm-analysis y de `web`** (este le entrega la configuración del tenant). Si llm-analysis no puede conseguirla, es él quien avisa a Reports; Retrieval solo avisa cuando **no logra llegar** a llm-analysis (`llm-unavailable`).
- **Conocimiento retirado:** Retrieval consulta lo que normalization tiene guardado (ver el README de normalization sobre los avisos retirados).

