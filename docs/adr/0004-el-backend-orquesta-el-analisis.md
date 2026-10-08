# 0004. El backend orquesta el análisis y el cliente es delgado

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

Los documentos describen el análisis de dos maneras que hay que integrar:

- El patrón **Template Method** presenta un pipeline del CLI con cinco pasos estrictos: autenticar la key, parsear dependencias (local), consultar vulnerabilidades (a NVD/OSV), analizar licencias y generar el reporte.
- El **diagrama de contenedores** muestra que el cliente solo habla con el Gateway, que este solo se conecta con Web y Reportes, y que la cadena es Reportes → Retrieval → Análisis LLM → Reportes. Además, **solo el Pipeline de Normalización** toca las fuentes externas.

Consultar NVD/OSV directamente desde cada CI de cliente agotaría los límites de tasa de esas APIs y duplicaría el trabajo de la normalización.

## Decisión

El cliente envía **una única solicitud** y el backend orquesta; los cinco pasos del documento se conservan así:

| Paso del documento | Dónde ocurre |
|---|---|
| `AuthenticateKey` | Cliente → `GET /v1/auth/verify` (invariante) |
| `ParseDependencies` | **Local** (hook; en CLI desde disco, en CI desde el workspace) |
| `FetchVulnerabilities`, `AnalyzeLicenses`, `GenerateReport` | **Etapas del mismo trabajo remoto**: `retrieving` → `analyzing` → `ready` |
| `PublishResult` | **Local** (hook; consola o comentario de PR) |

- Reportes crea el trabajo y devuelve `202`; el cliente **consulta** el estado hasta `ready`.
- Retrieval publica primero el **resultado determinístico** a Reportes: desde ahí el reporte ya se puede entregar, pase lo que pase con la IA.
- Los `OsvVulnerabilityFetcher` / `NvdVulnerabilityFetcher` del UML son **adaptadores del cliente hacia el backend** (leen la etapa de vulnerabilidades por el gateway); no consultan NVD/OSV.

## Consecuencias

- El cliente es simple y fácil de portar (CLI, Action, extensión).
- Reportes guarda estado y necesita tiempos máximos (`REPORTS_AI_TIMEOUT_MS`) para no dejar reportes colgados.
- El resultado determinístico es siempre entregable: es lo que permite el **resultado degradado**.

## Alternativas descartadas

- **El cliente orquesta un endpoint por paso:** sigue el texto del patrón al pie de la letra, pero añade una arista Gateway → Retrieval que el diagrama no dibuja y obliga a más viajes de red desde el CI del cliente.
- **El cliente consulta NVD/OSV directamente:** límites de tasa, duplicación y contradice el diagrama.
