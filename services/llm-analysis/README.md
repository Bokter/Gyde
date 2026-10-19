# llm-analysis: Servicio Análisis LLM

**Interpreta y correlaciona** la evidencia recuperada con todo el contexto del proyecto y devuelve hallazgos priorizados y explicados. Usa la **llave del propio estudio** (BYOK): Gyde no paga ni custodia las llaves de IA de los clientes más allá de lo imprescindible.

> **Estado:** implementado. Caso de uso, proveedores (mock, Anthropic y Google Gemini) y endpoint en vivo, con las capas de la arquitectura limpia (ADR 0011 y 0012).

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

- **Mock determinístico** (`src/infrastructure/adapters/mock-finding-analyzer.adapter.ts`): responde **solo** con `LLM_MOCK_ENABLED=true` y **sin llave**; el mismo entrada produce siempre la misma salida.
- **Google Gemini** (`gemini-finding-analyzer.adapter.ts`): `POST /v1beta/models/{modelo}:generateContent` con la llave del tenant en la cabecera `x-goog-api-key` (**nunca en la URL**), salida en JSON (`responseMimeType`) y la misma validación estricta de lo que responde el modelo; el nombre del modelo se valida antes de ir a la ruta. Un bloqueo de seguridad del proveedor (`promptFeedback.blockReason`) es `llm-error`.
- **Anthropic** (`anthropic-finding-analyzer.adapter.ts`): `POST /v1/messages` con la llave del tenant (`x-api-key`), timeout configurable (`LLM_PROVIDER_TIMEOUT_MS`, 30 s por defecto) y respuesta interpretada como JSON estricto.
- El breaker (puerto `ModelCallPolicy`, implementado por `ResilientModelCallPolicy`, un singleton del servicio) es **por tenant + proveedor**: la llave inválida o el rate limit de un estudio no abre el circuito de los demás. Con el circuito abierto se sirve la **última clasificación cacheada** cuando los hallazgos son idénticos (mismo tenant, proveedor y huella); si no la hay, `llm-unavailable`.

## Seguridad (BYOK)

- La llave llega **en claro** solo por la red interna y vive **en memoria** durante la llamada (caché máxima de 60 segundos).
- **Nunca** en logs, errores, mensajes publicados ni disco. `@gyde/service-kit` ya censura campos como `apiKey`, y todo mensaje que sale del servicio pasa por `redactSecrets` (`src/domain/redact.ts`). Hay una prueba obligatoria que lo verifica.
- Tratar la salida del modelo como **no confiable**: se valida con los esquemas, sin ejecutar nada de lo que devuelva.

## Estructura

```
src/domain/               reglas puras, solo imports relativos:
                          analysis.ts (tipos planos: AnalysisInput, ModelOutput, AiAnalysis, Finding...),
                          prompt.ts (prompt del sistema, buildUserPrompt, extractJsonText, fusión
                          applyModelPayload) y redact.ts (redactSecrets, truncateMessage)
src/application/          BackgroundJobs y:
  use-cases/              analyze-findings.use-case.ts (AnalyzeFindingsUseCase)
  dto/                    AnalyzeFindingsDto, AiResultDto, AnalysisFailureDto, TenantLlmConfig,
                          FailureReason (tipos planos, sin Zod)
  ports/                  TenantLlmConfigProvider, FindingAnalyzer, ReportsClient y ModelCallPolicy
src/infrastructure/       ResilientHttpClient (discovery + *_URL) y sus adaptadores:
  mappers/                ai-result.mapper.ts (valida con AiResult), analysis-failure.mapper.ts,
                          tenant-llm-config.mapper.ts (InternalLlmConfig -> TenantLlmConfig)
  adapters/               adaptadores de los puertos (sufijo .adapter.ts):
                          http-tenant-llm-config, mock-finding-analyzer, anthropic-finding-analyzer,
                          gemini-finding-analyzer, http-reports-client y resilient-model-call-policy
                          (ModelCallPolicy: un CircuitBreaker por tenant + proveedor y la caché de
                          respaldo; @gyde/resilience, huella con node:crypto)
  model-output.parser.ts  esquema Zod estricto de lo que responde el modelo (no implementa un puerto)
  service-resolver.ts     resolución de Web y Reports (discovery con respaldo en *_URL)
src/http/                 controlador NestJS (202 en vivo) y mappers/ (contrato <-> DTO)
src/app.module.ts         composition root: enlaza puertos con adaptadores (ADR 0011)
```

Las reglas de capas las aplica `pnpm lint` (ADR 0012).

El controlador no traduce errores a HTTP (responde `202` y el trabajo sigue en segundo plano), así que este servicio no tiene `application-error.interceptor.ts` ni `application/errors.ts`.

### Excepciones de contrato en application

Ninguna: `application/` no importa `@gyde/contracts`. Los puertos hablan en DTO y en `TenantLlmConfig` (que lleva la llave descifrada), no en tipos del contrato.

### Desviaciones de diseño

- **`AiResult` se valida dentro del analizador, no en el cliente de Reports.** `parseAiResult` (`infrastructure/mappers/ai-result.mapper.ts`) se llama desde `analyze` de cada proveedor y del mock: así un resultado inválido cuenta como una llamada fallida dentro del breaker y nunca llega a la caché de respaldo. `toAiResultContract` (en el cliente de Reports) solo tipa el cuerpo publicado.
- **Sin `application/errors.ts` ni clases de error de aplicación.** Los fallos del proveedor se publican con `describe(error)` = `"<name>: <message>"`; envolverlos en clases propias cambiaría el `name` y por tanto el `message` que recibe Reports. Los motivos se tipan con `FailureReason`.
- **Sin `domain/entities/` ni `domain/repositories/`.** `domain/` solo tiene tipos planos y funciones puras (`analysis.ts`, `prompt.ts`, `redact.ts`); el servicio no guarda entidades con identidad.
- **Mappers de identidad.** `toAnalyzeFindingsDto` y `toAiResultContract` devuelven el mismo objeto (los tipos son estructuralmente iguales a los del contrato) para no alterar el orden de claves, que forma parte del prompt y de la huella de la caché de respaldo.

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

Los criterios de aceptación son las pruebas de `test/` (65 pruebas en 5 archivos: `app.test.ts`, `characterization.test.ts`, `gemini-finding-analyzer.test.ts`, `prompt.test.ts` y `resilient-model-call-policy.test.ts`; `characterization.test.ts` fija los cuerpos, mensajes y prompts exactos que se publican y se envían al modelo).
