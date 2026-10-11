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
| `make-job.ts` | imprime el cuerpo de `POST /internal/analyses` desde `@gyde/contracts` (`tsx make-job.ts <free\|pro> <ai\|noai>`) |

- `KEEP_STACK=1` deja los contenedores encendidos al terminar. El proyecto de compose se llama `gyde-smoke` (`COMPOSE_PROJECT_NAME` lo cambia).
- Todas las llamadas a compose usan `--env-file .env`: el archivo de compose vive en `infra/compose`, y sin esa opción las variables del `.env` de la raíz no llegan a sus `${...}`.
- `web` está en la lista porque llm-analysis le pide la configuración de IA del tenant; sin ella el análisis con IA sale degradado aunque llm-analysis esté sano.
- Cuando el gateway esté integrado se añadirá el recorrido por `/v1/*` (ver `docs/workflow/dia-de-integracion.md`).
