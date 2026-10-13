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

1. **Autenticación** (`ApiKeyGuard` → `AuthenticateApiKey`): toma `Authorization: Bearer <key>`, comprueba que la clave cumpla los límites de `VerifyApiKeyRequest` (si no, `401` sin llamar a Web) y pregunta a Web (`POST /internal/api-keys/verify`, con `ResilientHttpClient`). `401 unauthorized` con un mismo mensaje para clave ausente, mal formada, desconocida, revocada o vencida.
2. **Caché de verificación** (~`API_KEY_CACHE_TTL_MS`, 60 s): solo guarda claves **válidas** y se indexa por el **SHA-256** de la clave, nunca por la clave. Una clave revocada puede seguir valiendo hasta que expire su entrada (aceptado); una clave recién creada funciona de inmediato porque los rechazos no se guardan.
3. **`GET /v1/auth/verify`** devuelve `AuthVerifyResponse` con los `Entitlements` que devolvió Web; no se recalculan.
4. **`POST /v1/analyses`** valida el cuerpo con `AnalysisRequest`, arma el `CreateAnalysisJob` (`tenantId` + `entitlements` + `request`) y lo envía a Reports (`POST /internal/analyses`); responde `202 AnalysisAccepted`.
5. **`GET /v1/analyses/:id` y `/markdown`** leen de Reports; `Report` se valida con el contrato y el `404` de un análisis inexistente se propaga como `404 not_found`.
6. **Límite de tasa (`429 rate_limited`)**: `RateLimitGuard`, después de autenticar, cuenta las peticiones de cada clave (por el `apiKeyId` que devolvió Web, nunca por el secreto) en una ventana fija de un minuto. El tope es `GATEWAY_RATE_LIMIT_PER_MINUTE` (300 por defecto: la CLI consulta `GET /v1/analyses/:id` cada 500 ms, es decir 120 peticiones por minuto durante un análisis, y debe quedar margen para varias a la vez con la misma clave). Al superarlo responde `429` con `Retry-After` en segundos. Las peticiones con clave inválida se rechazan antes y no cuentan: no hay una identidad a la que atribuirlas.
7. **Límite del plan (`402 plan_limit_exceeded`)**: solo en `POST /v1/analyses`. Usa `limits.analysesPerMonth` de los `Entitlements` que devolvió Web (`null` = ilimitado) y un contador por tenant y mes UTC detrás del puerto `UsageCounter`. El cupo se reserva **antes** de llamar a Reports (así peticiones simultáneas no lo rebasan) y se devuelve si Reports no acepta el análisis: una caída no le cuesta un análisis al cliente. Leer reportes no consume cupo.
8. **Orden de las comprobaciones**: clave (`401`) → tasa (`429`) → cuerpo (`400`) → plan (`402`) → Reports.
9. **Cabeceras**: `x-request-id` y `x-gyde-tenant-id` viajan a Reports (y `x-request-id` a Web), junto con `x-internal-token`.
10. **Errores**: sin instancia sana, circuito abierto, `5xx`, tiempo agotado, error de red o una respuesta que no cumple el contrato terminan en un único `503 upstream_unavailable` genérico. El detalle va al log; nombres de servicio y cuerpos del vecino no salen al cliente. El gateway **nunca** registra la clave ni la cabecera `Authorization`.

Estructura: `http/` (guarda y controlador), `application/` (casos de uso y puertos con su token), `infrastructure/` (adaptadores con `ResilientHttpClient`, caché en memoria, SHA-256), enlazado en `app.module.ts`.

### Limitaciones conocidas

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
