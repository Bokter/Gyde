# 0012. DTOs, entidades y pureza de capas en los servicios NestJS

- **Estado:** Aceptada
- **Fecha:** 2026-10-18

## Contexto

Los ADR [0002](0002-arquitectura-limpia-y-reglas-de-capas.md), [0003](0003-contratos-primero-con-zod-y-privacidad-estricta.md) y [0011](0011-nestjs-como-framework-de-los-servicios.md) definían las capas, los contratos zod y NestJS, pero el código de los seis servicios backend (`gateway`, `registry`, `retrieval`, `normalization`, `llm-analysis`, `reports`) no cumplía lo que prometían:

- Casi no había entidades (solo `ServiceInstance`) ni DTOs ni mappers de aplicación.
- `domain/` importaba `@gyde/contracts`, Zod, `node:crypto` y `spdx-expression-parse`.
- `application/` lanzaba `HttpError` o importaba `@gyde/service-kit`, `@gyde/resilience` y `node:crypto`.
- Un controlador (`reports`) llamaba al dominio sin caso de uso.
- Las reglas de lint solo prohibían capas exteriores y librerías de infraestructura; no impedían contratos, Zod ni `node:*`.

El framework no era el problema (ya era NestJS): faltaba el contenido de las capas y una regla ejecutable que lo mantuviera. Este ADR fija cómo quedan los servicios y cómo se comprueba.

## Decisión

### Reglas de dependencias

| Capa | Puede importar | No puede importar |
|---|---|---|
| `domain/` (entidades, valores, reglas y contratos de repositorio) | solo imports relativos dentro de `domain/` | `@gyde/*`, `zod`, `@nestjs/*`, `node:*`, librerías de terceros, `application/`, `infrastructure/`, `http/` |
| `application/` | `domain/` y relativos dentro de `application/` | `zod`, `@gyde/service-kit`, `@gyde/resilience`, `@gyde/discovery`, `@nestjs/*`, `node:*`, `infrastructure/`, `http/`; `@gyde/contracts` salvo la allowlist de abajo |
| `infrastructure/` | `application/` (puertos, DTOs), `domain/`, `@gyde/*`, librerías | `http/` |
| `http/` | `application/`, `@gyde/contracts`, `@gyde/service-kit`, `@nestjs/*`, mappers propios | `infrastructure/` |
| `app.module.ts`, `main.ts` | todo (composition root) | n/a |

El Servicio Web (Next.js) queda fuera de las reglas estrictas; mantiene las reglas de dirección de capas del [ADR 0002](0002-arquitectura-limpia-y-reglas-de-capas.md) dentro de cada `modules/<nombre>`.

### Estructura por carpetas y nomenclatura

Carpetas por tipo y sufijo por archivo; solo existen las que el servicio necesita.

| Pieza | Carpeta | Archivo | Clase o símbolo |
|---|---|---|---|
| Entidad | `domain/entities/` | `analysis.entity.ts` | `Analysis` |
| Contrato de repositorio | `domain/repositories/` | `report.repository.ts` | `ReportRepository` + `REPORT_REPOSITORY` |
| Caso de uso | `application/use-cases/` | `create-analysis.use-case.ts` | `CreateAnalysisUseCase` |
| DTO | `application/dto/` | `analysis.dto.ts` | `XxxDto` (tipo plano) |
| Puerto hacia otro servicio u otro recurso | `application/ports/` | `retrieval-client.ts` | `RetrievalClient` + `RETRIEVAL_CLIENT` |
| Errores de aplicación | `application/` | `errors.ts` | clase base del servicio + subclases |
| Adaptador de repositorio | `infrastructure/repositories/` | `postgres-report.repository.ts` | `PostgresReportRepository` |
| Adaptador de puerto | `infrastructure/adapters/` | `http-retrieval-client.adapter.ts` | `HttpRetrievalClient` |
| Mapper de infraestructura | `infrastructure/mappers/` | `analysis.mapper.ts` | funciones `toXxx` |
| Mapper de borde | `http/mappers/` | `reports.mapper.ts` | funciones `toXxxDto`, `toXxxContract` |
| Interceptor de errores | `http/` | `application-error.interceptor.ts` | `ApplicationErrorInterceptor` |
| Controlador | `http/` | `reports.controller.ts` | `ReportsController` |
| Composition root | raíz de `src/` | `app.module.ts` | `useFactory` + `@Inject(TOKEN)` |

El contrato de un repositorio es una `interface` más un token `Symbol` (no una clase abstracta: `esbuild` no emite metadatos de decoradores, [ADR 0011](0011-nestjs-como-framework-de-los-servicios.md)) y habla en entidades y tipos de dominio, nunca en contratos ni DTO. Solo los repositorios de una entidad van en `domain/repositories/`; los clientes de otros servicios, cachés, contadores y similares son puertos de `application/ports/`.

Un archivo de `infrastructure/adapters/` con sufijo `.adapter.ts` implementa un puerto de `application/ports/` o de `domain/` que no es el repositorio de una entidad (clientes HTTP de otros servicios, proveedores de modelo, cachés, contadores, hashers, parsers, políticas). No son adaptadores y se quedan en la raíz de `infrastructure/`: `service-resolver.ts`, `unavailable.ts`, `upstream-errors.ts`, los `*-startup.ts` y el parser de la salida del modelo (`model-output.parser.ts`). `normalization` conserva además `infrastructure/sources/**/*.adapter.ts` (adaptadores de fuente).

### Dominio

- **Entidades** con invariantes (`ServiceInstance` en registry, `Analysis` en reports): constructor privado y fábricas estáticas `create` (recurso nuevo, con la hora recibida) y `rehydrate` (desde estado guardado); `snapshot()` expone una vista de solo lectura con tipo propio del dominio y el mapper la convierte al contrato. En los demás servicios el dominio son tipos y funciones puras.
- **Sin `randomUUID` ni `Date.now()`** en `domain/`: el id y la hora entran por argumento (`create(registration, now: Date)`).
- **Constantes y tipos de contrato** que el dominio necesita (`Severity`, `SEVERITY_ORDER`, `ServiceName`...) se copian localmente como uniones de literales iguales a las del contrato, para que el contrato sea asignable sin casts. No hay paquete de dominio compartido: cada servicio tiene sus propios tipos aunque compartan nombre.
- **Librerías de terceros**: el dominio define una interfaz y `infrastructure/` la implementa. Ejemplo: `LicenseExpressionParser` en `retrieval/src/domain/ports.ts`, implementada sobre `spdx-expression-parse` en `infrastructure/adapters/spdx-license-expression-parser.adapter.ts`.
- Los patrones Template Method y Decorator se conservan; solo dependen de tipos de dominio locales.

### DTO y mappers

- **DTO** = tipo plano (`export type XxxDto = { ... }`) en `application/dto/`, sin decoradores ni Zod.
- La validación en ejecución sigue en el borde (ver el [ADR 0003](0003-contratos-primero-con-zod-y-privacidad-estricta.md)): `ZodValidationPipe(Schema)` en el controlador entrega el tipo del contrato, el mapper de `http/mappers/` lo convierte a DTO y devuelve la respuesta en la forma del contrato.
- Los clientes HTTP salientes de `infrastructure/` re-validan la respuesta con el schema del contrato y mapean a DTO o entidad antes de devolver al puerto.
- Los mappers son funciones puras (`toXxxDto`, `toXxxContract`, `toEntity`, `toRow`) sin lógica de negocio.

### Errores

`application/errors.ts` define una clase base del servicio (`extends Error` con `code` estable) y subclases, sin estado HTTP. En `http/application-error.interceptor.ts` un `NestInterceptor` con `catchError` las traduce a `HttpError` de `@gyde/service-kit`, con el mismo status, código y mensaje que el servicio devolvía antes; se registra con `{ provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor }` en `app.module.ts`. El sobre `ApiError` lo sigue produciendo el filtro global de `service-kit`. `HttpError` y `UpstreamServiceError` solo aparecen en `http/` e `infrastructure/`.

### Controladores delgados

Validar con el pipe, mapear a DTO, llamar al caso de uso y mapear la respuesta. Sin ramas de negocio ni llamadas al dominio. Un guard puede traducir la decisión de un caso de uso a una respuesta HTTP, pero la decisión la toma el caso de uso.

### Sin cambios de contrato

Rutas, códigos HTTP, payloads, cabeceras y mensajes de error no cambian; no se tocan `packages/contracts` ni `packages/service-kit`. Las pruebas de `test/app.test.ts` de cada servicio caracterizan ese comportamiento externo.

### Lint

Las reglas viven en `tooling/eslint/layer-boundaries.mjs` y se ejecutan con `pnpm lint` y en el CI (`eslint.config.mjs`). El archivo exporta `layerBoundaries` (dirección de capas y librerías de infraestructura) y `servicePurity` (pureza estricta de los seis servicios backend, con el Servicio Web fuera): `domain/` solo admite imports relativos; `application/` no admite `zod`, `@gyde/service-kit`, `@gyde/resilience`, `@gyde/discovery`, `@nestjs/*` ni `node:*`; los valores de `@gyde/contracts` están prohibidos en `application/` (`allowTypeImports` tolera `import type`).

### Allowlist de tipos de contrato en application

Un caso de uso o puerto de `application/` puede usar `import type { ... } from '@gyde/contracts'` solo si no crea ni modifica una entidad y su entrada y salida son exactamente un tipo del contrato (paso directo). Nunca valores (`SEVERITY_ORDER`, schemas Zod).

| Servicio | Archivo | Tipo | Motivo |
|---|---|---|---|
| gateway | `application/use-cases/get-report.use-case.ts` | `Report` | `GET /v1/analyses/:id` devuelve el reporte de Reports tal cual |
| gateway | `application/ports/report-reader.ts` | `Report` | puerto de lectura de ese caso de uso |
| registry, retrieval, normalization, llm-analysis, reports | ninguno | n/a | n/a |

El lint no distingue un `import type` permitido de uno que no figura en la tabla: la lista la hace cumplir el comando de aceptación

```
grep -rln "@gyde/contracts" services/{gateway,registry,retrieval,normalization,llm-analysis,reports}/src/application
```

cuya salida debe ser exactamente los dos archivos de gateway (cada uno también está listado en la sección "Excepciones de contrato en application" del README del servicio). Añadir una excepción exige editar esta tabla.

## Desviaciones conocidas

- **Interceptor en vez de filtro `@Catch`.** `ApiExceptionFilter` es `@Catch()` global y no se exporta de `service-kit`; un filtro específico reemplazaría al global para ese error en lugar de delegarle, y habría que reconstruir el sobre `ApiError`. El interceptor traduce y deja el sobre al filtro global.
- **El `ApiKeyGuard` del gateway traduce por su cuenta.** Los guards se ejecutan antes que los interceptores en el ciclo de vida de Nest, así que un error de aplicación lanzado desde un guard no pasa por el interceptor. Por diseño, `ApiKeyGuard` llama a `translateApplicationError` (exportada por `http/application-error.interceptor.ts`) antes de relanzar.
- **Sin puerto `Clock` ni `IdGenerator`.** Registry ya inyecta `now` por opción en los casos de uso y en `withOverrides`, y las entidades reciben la hora por argumento. Un puerto solo haría falta si no existiera una inyección equivalente.
- **Cast en `GET /v1/services/:serviceName` de registry.** El servicio responde `200` con lista vacía para un nombre desconocido; validarlo con `ZodValidationPipe(ServiceName)` lo convertiría en `400`, un cambio de contrato. El cast queda aislado y documentado en `http/mappers/registry.mapper.ts` (`toResolveDto`).
- **Contrato de repositorio en `domain/repositories/`** (interface + `Symbol`), no en `application/ports/`: es la ubicación de la guía. Esto corrige el [ADR 0011](0011-nestjs-como-framework-de-los-servicios.md), que situaba los puertos en `application/`.
- **Adaptadores en `infrastructure/adapters/` con sufijo `.adapter.ts`**, separados de los repositorios; lo que no implementa un puerto (ver la lista en la sección de estructura) no es adaptador.
- **Controlador en `http/` y `app.module.ts` en la raíz.** La guía los marca como opcionales dentro de Application; aquí `application/` no puede importar `@nestjs/*` (lint), así que se quedan fuera. No se repite como excepción en cada README.
- **Excepciones por servicio:**
  - `llm-analysis` no tiene `errors.ts` de aplicación: sus fallos se publican a Reports como `AnalysisFailureDto` desde el caso de uso. `AiResult` se valida en el analizador (`parseAiResult`, llamado por los adaptadores de proveedor dentro de la llamada protegida por el Circuit Breaker, de modo que un resultado inválido cuenta como llamada fallida), y los mappers de `http/` son de identidad.
  - `retrieval` y `llm-analysis` no tienen interceptor: su controlador responde `202` y no traduce errores a HTTP (el trabajo sigue en segundo plano).
  - `reports` mantiene sus tipos de dominio de reporte (`domain/report/report-types.ts`) mutables, sin `readonly`, heredados del diseño Decorator.

## Consecuencias

- El dominio se prueba sin Nest, sin BD y sin contratos; el código coincide con lo que dicen los ADR 0002, 0003 y 0011 y con CONTRIBUTING.
- Se paga con más archivos (DTOs, mappers, errores, interceptor) y con mapeos explícitos en los bordes.
- Las reglas de pureza fallan en `pnpm lint` y en el CI, no en una revisión manual; la allowlist depende de un comando de aceptación.
- Queda aceptada la deuda de los casos de uso de paso con `import type` de contratos (hoy, dos archivos de gateway).

## Alternativas descartadas

- **DTO como clase con `class-validator`:** duplica cada schema Zod (ADR 0003), exige replicar `strictObject` y cambia el formato `details` del `400`.
- **Filtro `@Catch` + `APP_FILTER` para los errores de aplicación:** reemplaza al filtro global y obliga a reconstruir el sobre `ApiError`.
- **Puerto `Clock`/`IdGenerator` en todos los servicios:** añade una abstracción donde el id y la hora ya entran por argumento u opción inyectable.
- **Contrato de repositorio como clase abstracta:** `esbuild` no emite metadatos de decoradores; se usa interface + `Symbol` ([ADR 0011](0011-nestjs-como-framework-de-los-servicios.md)).
- **DTO para todo caso de uso:** mappers vacíos en los casos de paso; se prefiere la allowlist explícita.
- **Paquete `domain-kernel` compartido:** acopla servicios que solo se hablan por HTTP.
