# Prueba de humo del recorrido de análisis

`bash infra/scripts/smoke-retrieval.sh` levanta el stack real (PostgreSQL, registry, **normalization**, **retrieval**, **reports**, **llm-analysis** y **web**, sin dobles), ingesta los *fixtures* de OSV y crea análisis en Reports (`POST /internal/analyses`), que es quien llama a Retrieval. Espera a que `GET /internal/analyses/:id` llegue a `ready` y comprueba, en cada caso, el resultado exacto de [`fixtures/README.md`](../../../fixtures/README.md): un hallazgo para `Acme.Serialization` (SAMPLE-0001), el de licencia de `Acme.GplToolkit`, ninguno por SAMPLE-0002 ni SAMPLE-0003, siempre en ese orden.

| Caso | Plan | IA | llm-analysis | Esperado |
|---|---|---|---|---|
| 1 | Free | no | encendido | `ready`, **no** degradado, sin `aiExplanation`. Se repite y da lo mismo |
| 2 | Pro | sí | encendido con `LLM_MOCK_ENABLED=true` | `ready`, no degradado, `aiExplanation` en cada hallazgo, capa `ai-enrichment` |
| 3 | Pro | sí | **apagado** | `ready`, degradado con `llm-unavailable`, sin `aiExplanation` |

| Archivo | Para qué |
|---|---|
| `../smoke-retrieval.sh` | el guion: levanta, ingesta, crea los análisis y comprueba |
| `make-job.ts` | imprime el cuerpo de `POST /internal/analyses` desde `@gyde/contracts` (`tsx make-job.ts <free\|pro> <ai\|noai>`) o, con `request`, solo el `AnalysisRequest` de `POST /v1/analyses` |

- `KEEP_STACK=1` deja los contenedores encendidos al terminar. El proyecto de compose se llama `gyde-smoke` (`COMPOSE_PROJECT_NAME` lo cambia).
- Todas las llamadas a compose usan `--env-file .env`: el archivo de compose vive en `infra/compose`, y sin esa opción las variables del `.env` de la raíz no llegan a sus `${...}`.
- `web` está en la lista porque llm-analysis le pide la configuración de IA del tenant; sin ella el análisis con IA sale degradado aunque llm-analysis esté sano.
## La parte del gateway

Con `SMOKE_API_KEY=<una key emitida por la web>` y el gateway implementado, el script además recorre la API pública (`/v1/*`) con esa key:

1. `GET /v1/auth/verify` con la key (200), con una key inválida (401) y sin key (401).
2. `/internal/*` por el gateway no se sirve (401, 403 o 404).
3. `POST /v1/analyses` con el proyecto de ejemplo (202), `GET /v1/analyses/:id` hasta `ready` con el resultado exacto de `fixtures/README.md`, y el Markdown con el hallazgo de SAMPLE-0001.
4. Con Reports detenido, `POST /v1/analyses` responde `503` en lugar de colgarse.

Si no hay `SMOKE_API_KEY`, o el gateway todavía responde `501`, esa parte se **omite** y la última línea lo dice (`SMOKE TEST PASSED (gateway part skipped: ...)`). `GATEWAY_URL` apunta el script a otro gateway (por defecto `http://localhost:4000`).

> Hasta que exista un gateway real, esta parte solo se ha probado contra un gateway de mentira que cumple el contrato de `ROUTES.gateway`. La primera ejecución contra el real puede necesitar ajustes.

Las comprobaciones que van más allá del humo (privacidad de punta a punta y los pasos de la demo) están en [`docs/workflow/dia-de-integracion.md`](../../../docs/workflow/dia-de-integracion.md).
