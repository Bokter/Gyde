# Prueba de humo del recorrido de conocimiento

`bash infra/scripts/smoke-retrieval.sh` levanta PostgreSQL, el registry, **normalization** y **retrieval**, ingesta los *fixtures* de OSV, llama a `POST /internal/retrieve` con el proyecto de ejemplo y comprueba el resultado exacto de [`fixtures/README.md`](../../../fixtures/README.md): un hallazgo para `Acme.Serialization` (SAMPLE-0001), el de licencia de `Acme.GplToolkit`, ninguno por SAMPLE-0002 ni SAMPLE-0003, y el mismo resultado al repetirlo.

Reports todavía no recibe resultados, así que se sustituye por un doble (`reports-stub.mjs`) que solo registra lo que Retrieval publica. Cuando Reports implemente `POST /internal/analyses/:id/deterministic`, el script debe leer el reporte real en lugar del doble.

| Archivo | Para qué |
|---|---|
| `../smoke-retrieval.sh` | el guion: levanta, ingesta, consulta y comprueba |
| `compose.smoke.yaml` | se suma a `infra/compose/compose.yaml` y pone el doble de Reports en la red con el nombre `reports` |
| `reports-stub.mjs` | el doble: responde 202 y devuelve lo recibido en `GET /captured` |
| `make-request.ts` | imprime el cuerpo de `POST /internal/retrieve` desde `@gyde/contracts/samples` |

`KEEP_STACK=1` deja los contenedores encendidos al terminar. Usa `--env-file .env` en todas las llamadas a compose: sin él, las variables del `.env` de la raíz no llegan a los `${...}` del archivo de compose (que vive en `infra/compose`).
