# gateway: API Gateway

Único punto de entrada del backend para la **CLI, la GitHub Action y la extensión de VS Code**. Autentica la API key, aplica límites del plan y enruta a los servicios internos descubriéndolos en el Service Registry y llamándolos detrás de un Circuit Breaker.

> **Estado:** autenticación por API key, `GET /v1/auth/verify` y análisis (`POST` y `GET`) implementados (**Área 1**, `docs/tasks/area-1-plataforma-y-borde.md`). **Pendiente:** límites del plan (`402 plan_limit_exceeded`) y de tasa (`429 rate_limited`).

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
6. **Cabeceras**: `x-request-id` y `x-gyde-tenant-id` viajan a Reports (y `x-request-id` a Web), junto con `x-internal-token`.
7. **Errores**: sin instancia sana, circuito abierto, `5xx`, tiempo agotado, error de red o una respuesta que no cumple el contrato terminan en un único `503 upstream_unavailable` genérico. El detalle va al log; nombres de servicio y cuerpos del vecino no salen al cliente. El gateway **nunca** registra la clave ni la cabecera `Authorization`.

Estructura: `http/` (guarda y controlador), `application/` (casos de uso y puertos con su token), `infrastructure/` (adaptadores con `ResilientHttpClient`, caché en memoria, SHA-256), enlazado en `app.module.ts`.

### Limitaciones conocidas

- `Report` no incluye el `tenantId`, así que el gateway no puede comprobar que el análisis pedido pertenezca al tenant de la clave: hoy cualquier clave válida puede leer un análisis cuyo id conozca. Hace falta que Reports filtre por `x-gyde-tenant-id` (Área 4).
- La caché de verificación vive en memoria de cada instancia del gateway.

## Configuración

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GATEWAY_PORT` | no (4000) | Puerto de escucha |
| `INTERNAL_SERVICE_TOKEN` | sí | Secreto para llamadas entre servicios |
| `REGISTRY_URL` | no | URL del Service Registry (descubrimiento) |
| `WEB_URL` | no | URL estática de Web, respaldo si el registry no la resuelve |
| `REPORTS_URL` | no | URL estática de Reports, respaldo si el registry no la resuelve |
| `API_KEY_CACHE_TTL_MS` | no (60000) | Cuánto se confía en una clave verificada antes de preguntar a Web otra vez |

## Ejecutar

```bash
pnpm --filter @gyde/gateway dev     # desarrollo (recarga)
pnpm --filter @gyde/gateway test
```
