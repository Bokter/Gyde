# @gyde/contracts

Esquemas **zod** y tipos TypeScript compartidos: es el acuerdo entre todas las piezas de Gyde (clientes, gateway y servicios). Si dos piezas se comunican, el formato del mensaje vive aquí.

## Qué contiene

| Archivo | Contenido |
|---|---|
| `analysis.ts` | `AnalysisRequest` y sus partes: lo único que el cliente puede enviar al backend |
| `findings.ts` | `Finding` y `Evidence`: riesgos priorizados y explicables |
| `knowledge.ts` | `KnowledgeObject` (esquema común del Pipeline de Normalización) y `KnowledgeQuery` |
| `report.ts` | `Report`, estados del análisis, capas (Decorator) y motivos de resultado degradado |
| `pipeline.ts` | Mensajes entre servicios: `CreateAnalysisJob`, `RetrieveRequest`, `DeterministicResult`, `LlmAnalysisRequest`, `AiResult`, `AnalysisFailure` |
| `auth.ts` | Planes, `Entitlements`, `PLAN_CATALOG` y verificación de API keys |
| `llm.ts` | Configuración BYOK de llaves LLM (`InternalLlmConfig` lleva un secreto en claro) |
| `registry.ts` | Registro e instancias para Service Discovery |
| `errors.ts` | `ApiError` y códigos de error con su estado HTTP |
| `routes.ts` | `ROUTES` (rutas HTTP), `HEADERS` y `buildPath()` |
| `samples.ts` | Datos sintéticos para mocks y pruebas (`@gyde/contracts/samples`) |

## Reglas

1. **Privacidad.** Todos los objetos de `analysis.ts` son `strictObject`: un campo desconocido (ruta de archivo, fragmento de código, URL de repositorio…) se rechaza con 400. No los relajes sin revisión de todo el equipo; `test/privacy.test.ts` protege este invariante.
2. **Contrato primero.** Si necesitas un campo nuevo, cambia el esquema en un PR pequeño (`feat(contracts): ...`) y avisa a las áreas que lo consumen; el PR requiere revisión de otra área.
3. **Cambios incompatibles** llevan `!` en el commit (`feat(contracts)!: ...`) y se anuncian en el canal del equipo.
4. **Valida en las fronteras.** Los servicios validan lo que reciben con estos esquemas (`schema.parse`) y devuelven errores con `ApiError`; dentro del dominio se usan los tipos ya validados.
5. **Mocks desde el día 1.** Usa `@gyde/contracts/samples` para simular al servicio vecino mientras no existe.

## Uso

```ts
import { AnalysisRequest, ROUTES, buildPath } from '@gyde/contracts';
import { sampleReportReady } from '@gyde/contracts/samples';

const request = AnalysisRequest.parse(body);
const url = buildPath(ROUTES.gateway.analysis, { analysisId });
```

## Planes (propuesta)

`PLAN_CATALOG` define Free / Pro / Studio como **datos**. La lógica de negocio lee `Entitlements`, nunca el nombre del plan. El Área 2 es dueña de los valores finales.
