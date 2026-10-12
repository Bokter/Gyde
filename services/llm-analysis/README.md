# llm-analysis: Servicio Análisis LLM

**Interpreta y correlaciona** la evidencia recuperada con todo el contexto del proyecto y devuelve hallazgos priorizados y explicados. Usa la **llave del propio estudio** (BYOK): Gyde no paga ni custodia las llaves de IA de los clientes más allá de lo imprescindible.

> **Estado:** esqueleto ejecutable (501) con los **puertos** y el caso de uso documentado. Implementación: **Área 4** (`docs/tasks/area-4-motor-llm-y-reportes.md`).

- Puerto: `LLM_ANALYSIS_PORT` (4400) · Solo red interna · Su único cliente es **Retrieval**.
- Origen en el documento: contenedor *Servicio de análisis LLM* ("Interpreta y correlaciona") y el servicio de clasificación de IA del patrón Circuit Breaker.

## Flujo

1. Retrieval llama `POST /internal/analyze` con la evidencia y recibe `202`.
2. El servicio obtiene la configuración LLM del **tenant** desde Web (`GET /internal/tenants/:id/llm-config`) y la usa solo durante la llamada.
3. Llama al proveedor **detrás de un Circuit Breaker por tenant + proveedor**.
4. Valida la respuesta con el esquema `AiResult` y la publica en **Reports**.

Cuando no puede (sin llave, proveedor caído o error) publica un `AnalysisFailure` con el motivo (`llm-not-configured`, `llm-unavailable`, `llm-error`) y el reporte sale **degradado** con el resultado determinístico. Nunca bloquea el análisis.

## Seguridad (BYOK)

- La llave llega **en claro** solo por la red interna y vive **en memoria** durante la llamada (caché máxima de ~1 minuto si se justifica).
- **Nunca** en logs, errores, mensajes publicados ni disco. `@gyde/service-kit` ya censura campos como `apiKey`, pero un secreto dentro de un texto no se puede detectar: ten cuidado al armar mensajes.
- Tratar la salida del modelo como **no confiable**: validar con el esquema, sin ejecutar nada de lo que devuelva.
- El breaker es **por tenant + proveedor**: la llave inválida o el rate limit de un estudio no debe abrir el circuito de los demás.

## Estructura

```
src/application/ports/     TenantLlmConfigProvider, FindingAnalyzer, ReportsClient (ya definidos)
src/application/           AnalyzeFindings (caso de uso documentado)
src/domain/                construcción del prompt y reglas puras
src/infrastructure/providers/  adaptadores Anthropic / OpenAI y un proveedor mock determinístico
src/http/                  ruta (ya declarada como stub)
```

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `LLM_ANALYSIS_PORT` | 4400 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `WEB_URL`, `REPORTS_URL` | — | URLs estáticas de respaldo si el registry no resuelve |
| `LLM_MOCK_ENABLED` | false | Solo desarrollo: responde con el proveedor mock si el tenant no tiene llave |

Los criterios de aceptación están como `it.todo` en `test/app.test.ts`.
