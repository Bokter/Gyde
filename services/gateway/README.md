# gateway: API Gateway

Único punto de entrada del backend para la **CLI y la GitHub Action**. Autentica la API key, aplica límites del plan y enruta a los servicios internos descubriéndolos en el Service Registry y llamándolos detrás de un Circuit Breaker.

> **Estado:** implementado (**Área 1**, `docs/tasks/area-1-plataforma-y-borde.md`): autenticación por API key, `GET /v1/auth/verify`, análisis (`POST` y `GET`), límite del plan (`402`) y límite de tasa (`429`).

- Puerto: `GATEWAY_PORT` (4000) · Salud: `GET /healthz`, `GET /readyz`
- Origen en el documento: contenedor *API Gateway* ("Enruta y autentica") y el rol de "Interfaz" de los diagramas de secuencia.

## API pública

Autenticación: `Authorization: Bearer <API key>`. Rutas y esquemas en `@gyde/contracts` (`ROUTES.gateway`).

| Método y ruta | Cuerpo | Respuesta | Reenvía a |
|---|---|---|---|
| `GET /v1/auth/verify` | — | `AuthVerifyResponse` (plan y permisos) | Web (`POST /internal/api-keys/verify`) |
| `POST /v1/analyses` | `AnalysisRequest` | `202 AnalysisAccepted` | Reports (`POST /internal/analyses`) |
| `GET /v1/analyses/:analysisId` | — | `Report` | Reports |
| `GET /v1/analyses/:analysisId/markdown` | — | `text/markdown` | Reports |

El gateway **nunca** enruta `/internal/*`: esas rutas son solo entre servicios.

## Cómo funciona

1. **Autenticación** (`ApiKeyGuard` → `AuthenticateApiKeyUseCase`): toma `Authorization: Bearer <key>`, comprueba que la clave cumpla los límites de longitud 10..200 (regla de dominio `isWellFormedApiKey`, copia de los de `VerifyApiKeyRequest`; si no, `401` sin llamar a Web; un test compara ambas para longitudes 0..205) y pregunta a Web (`POST /internal/api-keys/verify`, con `ResilientHttpClient`). `401 unauthorized` con un mismo mensaje para clave ausente, mal formada, desconocida, revocada o vencida.
2. **Caché de verificación** (~`API_KEY_CACHE_TTL_MS`, 60 s): solo guarda claves **válidas** y se indexa por el **SHA-256** de la clave, nunca por la clave. Una clave revocada puede seguir valiendo hasta que expire su entrada (aceptado); una clave recién creada funciona de inmediato porque los rechazos no se guardan.
3. **`GET /v1/auth/verify`** devuelve `AuthVerifyResponse` con los `Entitlements` que devolvió Web; no se recalculan.
4. **`POST /v1/analyses`** valida el cuerpo con `AnalysisRequest`, arma el `CreateAnalysisJob` (`tenantId` + `entitlements` + `request`) y lo envía a Reports (`POST /internal/analyses`); responde `202 AnalysisAccepted`.
5. **`GET /v1/analyses/:id` y `/markdown`** leen de Reports; `Report` se valida con el contrato y el `404` de un análisis inexistente se propaga como `404 not_found`.
6. **Límite de tasa (`429 rate_limited`)**: `RateLimitGuard`, después de autenticar, cuenta las peticiones de cada clave (por el `apiKeyId` que devolvió Web, nunca por el secreto) en una ventana fija de un minuto. El tope es `GATEWAY_RATE_LIMIT_PER_MINUTE` (300 por defecto: la CLI consulta `GET /v1/analyses/:id` cada 500 ms, es decir 120 peticiones por minuto durante un análisis, y debe quedar margen para varias a la vez con la misma clave). Al superarlo responde `429` con `Retry-After` en segundos. Las peticiones con clave inválida se rechazan antes y no cuentan: no hay una identidad a la que atribuirlas.
7. **Límite del plan (`402 plan_limit_exceeded`)**: solo en `POST /v1/analyses`. Usa `limits.analysesPerMonth` de los `Entitlements` que devolvió Web (`null` = ilimitado) y un contador por tenant y mes UTC detrás del puerto `UsageCounter`. El cupo se reserva **antes** de llamar a Reports (así peticiones simultáneas no lo rebasan) y se devuelve si Reports no acepta el análisis: una caída no le cuesta un análisis al cliente. Leer reportes no consume cupo.
8. **Orden de las comprobaciones**: clave (`401`) → tasa (`429`) → cuerpo (`400`) → plan (`402`) → Reports.
9. **Cabeceras**: `x-request-id` y `x-gyde-tenant-id` viajan a Reports (y `x-request-id` a Web), junto con `x-internal-token`.
10. **Errores**: sin instancia sana, circuito abierto, `5xx`, tiempo agotado, error de red o una respuesta que no cumple el contrato terminan en un único `503 upstream_unavailable` genérico. El detalle va al log; nombres de servicio y cuerpos del vecino no salen al cliente. El gateway **nunca** registra la clave ni la cabecera `Authorization`.

## Estructura

```
src/domain/          Principal y Entitlements (tipos), RateLimitWindow y RateLimitDecision (ventana fija),
                     TenantUsage y billingPeriodOf (cupo mensual por tenant, mes UTC), isWellFormedApiKey
                     (límites de la clave); solo imports relativos, sin leer la hora
src/application/     use-cases/ (AuthenticateApiKeyUseCase, EnforceRateLimitUseCase, SubmitAnalysisUseCase,
                     GetReportUseCase), dto/ (tipos planos que reflejan el contrato), errors.ts (GatewayError, UnauthorizedError,
                     PlanLimitExceededError, sin HTTP), request-context.ts y ports/ con su token
src/infrastructure/  adapters/ (*.adapter.ts): WebApiKeyVerifier y HttpReportsClient (ResilientHttpClient),
                     MemoryAuthCache, MemoryRateLimiter y MemoryUsageCounter (Maps, TTL y expulsión; las
                     reglas están en domain/), Sha256KeyHasher; service-resolver.ts, upstream-errors.ts
                     y mappers/ (contrato -> DTO)
src/http/            controlador y guards delgados, mappers/ (contrato <-> DTO) y application-error.interceptor.ts
src/app.module.ts    composition root: enlaza puertos con adaptadores y registra el interceptor (ADR 0011)
```

Las reglas de capas las aplica `pnpm lint` (ADR 0012).

`domain/` solo contiene *value objects* y reglas puras (tipos planos y funciones): no hay `domain/entities/` ni `domain/repositories/`, porque el gateway no guarda entidades con identidad (la caché, el límite de tasa y el contador mensual son puertos con adaptadores en memoria).

### Errores

Los casos de uso lanzan errores de aplicación sin estado HTTP; se traducen al mismo `HttpError` de siempre:

| Error de aplicación | Código y estado HTTP | Mensaje |
|---|---|---|
| `UnauthorizedError` | `unauthorized`, 401 | `Missing or invalid API key` |
| `PlanLimitExceededError` | `plan_limit_exceeded`, 402 | `The <plan> plan allows <n> analyses per month and this tenant has used them` |
| otro `GatewayError` | `internal`, 500 | `Internal server error` |

`ApplicationErrorInterceptor` (`APP_INTERCEPTOR`) traduce lo que lanzan los manejadores de ruta (`PlanLimitExceededError`). Los guards se ejecutan **antes** que los interceptores, así que `ApiKeyGuard` aplica la misma función (`translateApplicationError`) al `UnauthorizedError` de `AuthenticateApiKeyUseCase`. El límite de tasa no lanza un error de aplicación: `EnforceRateLimitUseCase` devuelve una `RateLimitDecision` y `RateLimitGuard` la traduce a `Retry-After` y `429 rate_limited`. Los `HttpError` de los adaptadores (`upstream_unavailable`, `not_found` de Reports) pasan sin tocar. El sobre `ApiError` lo sigue produciendo el filtro global de `service-kit`.

## Excepciones de contrato en application

Solo estos dos archivos importan `@gyde/contracts` (`import type`), por ser pass-through del `Report`:

- `use-cases/get-report.use-case.ts`: `Report` (`GET /v1/analyses/:id` devuelve el reporte de Reports tal cual).
- `report-reader.ts` (`ports/`): `Report`, el puerto de lectura de ese caso de uso.

El resto de `application/` habla en DTOs (`dto/gateway.dto.ts`) y en tipos de `domain/`. Los DTO son un espejo estructural del contrato y los mappers entregan el valor por referencia; `test/dto-contract.test.ts` falla al compilar si el contrato y el DTO dejan de ser asignables entre sí.

## Limitaciones conocidas

- `Report` no incluye el `tenantId`, así que el gateway no puede comprobar que el análisis pedido pertenezca al tenant de la clave: hoy cualquier clave válida puede leer un análisis cuyo id conozca. Hace falta que Reports filtre por `x-gyde-tenant-id` (Área 4).
- La caché de verificación, el contador mensual y el límite de tasa viven en memoria de cada instancia: se reinician con el gateway y no se comparten entre réplicas. Con varias réplicas el tope real sería el límite por el número de instancias. Una persistencia compartida (por ejemplo Redis) queda fuera del MVP.
- El límite de tasa es por clave: no protege de quien prueba muchas claves inválidas.

## Configuración

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GATEWAY_PORT` | no (4000) | Puerto de escucha |
| `INTERNAL_SERVICE_TOKEN` | sí | Secreto para llamadas entre servicios |
| `REGISTRY_URL` | no | URL del Service Registry (descubrimiento) |
| `WEB_URL` | no | URL estática de Web, respaldo si el registry no la resuelve |
| `REPORTS_URL` | no | URL estática de Reports, respaldo si el registry no la resuelve |
| `API_KEY_CACHE_TTL_MS` | no (60000) | Cuánto se confía en una clave verificada antes de preguntar a Web otra vez |
| `GATEWAY_RATE_LIMIT_PER_MINUTE` | no (300) | Peticiones por minuto y por clave antes de responder `429` |

## Ejecutar

```bash
pnpm --filter @gyde/gateway dev     # desarrollo (recarga)
pnpm --filter @gyde/gateway test
```
