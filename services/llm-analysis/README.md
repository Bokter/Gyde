# llm-analysis: Servicio Análisis LLM

**Interpreta y correlaciona** la evidencia recuperada con todo el contexto del proyecto y devuelve hallazgos priorizados y explicados. Usa la **llave del propio estudio** (BYOK): Gyde no paga ni custodia las llaves de IA de los clientes más allá de lo imprescindible.

> **Estado:** implementado (PR D). Caso de uso, proveedores (mock + Anthropic) y endpoints en vivo.

- Puerto: `LLM_ANALYSIS_PORT` (4400) · Solo red interna · Su único cliente es **Retrieval**.
- Origen en el documento: contenedor *Servicio de análisis LLM* ("Interpreta y correlaciona") y el servicio de clasificación de IA del patrón Circuit Breaker.

## Flujo

1. Retrieval llama `POST /internal/analyze` con la evidencia y recibe `202` (`{ analysisId, status: 'analyzing' }`): el trabajo sigue en segundo plano.
2. El servicio obtiene la configuración LLM del **tenant** desde Web (`GET /internal/tenants/:id/llm-config`, caché **en memoria de 60 s**) y la usa solo durante la llamada.
3. Llama al proveedor **detrás de un Circuit Breaker por tenant + proveedor** (`${tenantId}:${provider}`).
4. Valida la respuesta (fusionando explicaciones sobre los hallazgos determinísticos) con el esquema `AiResult` y la publica en **Reports** (`POST /internal/analyses/:id/ai-result`).

Cuando no puede (sin llave, proveedor caído o error) publica un `AnalysisFailure` con el motivo (`llm-not-configured`, `llm-unavailable`, `llm-error`) y el reporte sale **degradado** con los hallazgos determinísticos. Nunca bloquea el análisis. Si el propio servicio está caído, quien lo nota y publica `llm-unavailable` es Retrieval (su cliente); ver `docs/architecture/02-flujos.md`.

**El orden de los hallazgos del modelo ES su prioridad.** El modelo solo añade `aiExplanation` y un orden; severidad, evidencia, versiones y licencias salen siempre del motor determinístico. Un texto libre o un id inventado no llega al reporte: se convierte en `llm-error`.

## Proveedores

Proveedores soportados hoy: **Anthropic** y **Google Gemini**. Un tenant con otro proveedor (`openai`) recibe `AnalysisFailure` `llm-error` (`LLM provider "openai" is not supported yet`) y no sale ninguna petición: la llave solo se entrega al proveedor al que pertenece.

- **Mock determinístico** (`src/infrastructure/providers/mock-finding-analyzer.ts`): responde **solo** con `LLM_MOCK_ENABLED=true` y **sin llave**; el mismo entrada produce siempre la misma salida.
- **Google Gemini** (`gemini-finding-analyzer.ts`): `POST /v1beta/models/{modelo}:generateContent` con la llave del tenant en la cabecera `x-goog-api-key` (**nunca en la URL**), salida en JSON (`responseMimeType`) y la misma validación estricta de lo que responde el modelo; el nombre del modelo se valida antes de ir a la ruta. Un bloqueo de seguridad del proveedor (`promptFeedback.blockReason`) es `llm-error`.
- **Anthropic** (`anthropic-finding-analyzer.ts`): `POST /v1/messages` con la llave del tenant (`x-api-key`), timeout configurable (`LLM_PROVIDER_TIMEOUT_MS`, 30 s por defecto) y respuesta interpretada como JSON estricto.
- El breaker es **por tenant + proveedor**: la llave inválida o el rate limit de un estudio no abre el circuito de los demás. Con el circuito abierto se sirve la **última clasificación cacheada** cuando los hallazgos son idénticos (mismo tenant, proveedor y huella); si no la hay, `llm-unavailable`.

## Seguridad (BYOK)

- La llave llega **en claro** solo por la red interna y vive **en memoria** durante la llamada (caché máxima de 60 segundos).
- **Nunca** en logs, errores, mensajes publicados ni disco. `@gyde/service-kit` ya censura campos como `apiKey`, y todo mensaje que sale del servicio pasa por `redactSecrets` (`src/domain/redact.ts`). Hay una prueba obligatoria que lo verifica.
- Tratar la salida del modelo como **no confiable**: se valida con los esquemas, sin ejecutar nada de lo que devuelva.

## Estructura

```
src/application/ports/     TenantLlmConfigProvider, FindingAnalyzer, ReportsClient (los puertos del servicio)
src/application/           AnalyzeFindings (caso de uso) y BackgroundJobs
src/domain/                prompt del modelo, fusión de explicaciones y redacción de secretos
src/infrastructure/        ResilientHttpClient (discovery + *_URL) y sus adaptadores:
  providers/               HttpTenantLlmConfigProvider, MockFindingAnalyzer,
                           AnthropicFindingAnalyzer, GeminiFindingAnalyzer, HttpReportsClient
src/http/                  controlador NestJS (202 en vivo)
src/app.module.ts          composition root: enlaza puertos con adaptadores (ADR 0011)
```

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `LLM_ANALYSIS_PORT` | 4400 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `WEB_URL`, `REPORTS_URL` | — | URLs estáticas de respaldo si el registry no resuelve |
| `REGISTRY_URL` | — | Con registry, Web y Reports se resuelven por discovery |
| `LLM_MOCK_ENABLED` | false | Solo desarrollo: si el tenant no tiene llave, responde el mock |
| `CB_*` | — | Umbrales del Circuit Breaker (`packages/resilience`). `CB_CALL_TIMEOUT_MS` no se aplica a la llamada al modelo |
| `LLM_PROVIDER_TIMEOUT_MS` | `30000` | Tiempo máximo de una llamada al proveedor de IA; el breaker espera este valor más 15 s, para que no corte una respuesta lenta y la cuente como fallo |

Los criterios de aceptación son las 16 pruebas de `test/app.test.ts`.
