# gateway: API Gateway

Único punto de entrada del backend para la **CLI, la GitHub Action y la extensión de VS Code**. Autentica la API key, aplica límites del plan y enruta a los servicios internos descubriéndolos en el Service Registry y llamándolos detrás de un Circuit Breaker.

> **Estado:** esqueleto ejecutable. Los endpoints responden `501 not_implemented` (ya validan el cuerpo). Implementación: **Área 1** (`docs/tasks/area-1-plataforma-y-borde.md`).

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

## Qué implementar

1. Autenticación: verifica la key contra Web, con caché corta; propaga `x-gyde-tenant-id` y `x-request-id`.
2. Límites del plan (`Entitlements`): `402 plan_limit_exceeded` y límite de tasa `429` por key.
3. Discovery: pide una instancia al registry (`@gyde/discovery`) y llama **a través** de un Circuit Breaker (`@gyde/resilience`); sin instancia sana → `503 upstream_unavailable` controlado.
4. Handlers delgados que llaman casos de uso en `application/`; adaptadores HTTP en `infrastructure/`.

Los criterios de aceptación están como `it.todo` en `test/app.test.ts`.

## Configuración

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GATEWAY_PORT` | no (4000) | Puerto de escucha |
| `INTERNAL_SERVICE_TOKEN` | sí | Secreto para llamadas entre servicios |
| `REGISTRY_URL` | no | URL del Service Registry |

## Ejecutar

```bash
pnpm --filter @gyde/gateway dev     # desarrollo (recarga)
pnpm --filter @gyde/gateway test
```
