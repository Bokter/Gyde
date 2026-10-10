# 0011. NestJS como framework de los servicios del backend

- **Estado:** Aceptada (reemplaza la elección de Fastify del [ADR 0001](0001-monorepo-typescript-con-pnpm-y-turborepo.md))
- **Fecha:** 2026-10-10

## Contexto

El equipo exige que el backend siga **arquitectura limpia con NestJS**. El esqueleto inicial usaba Fastify directo con un `buildApp` propio en `@gyde/service-kit`. NestJS aporta módulos, inyección de dependencias y controladores: encajan con las capas del [ADR 0002](0002-arquitectura-limpia-y-reglas-de-capas.md) y con los puertos y adaptadores.

## Decisión

Los seis servicios del backend (`gateway`, `registry`, `normalization`, `retrieval`, `llm-analysis`, `reports`) se construyen con **NestJS 12 sobre el adaptador de Fastify** (`@nestjs/platform-fastify`). Se conserva Fastify por debajo para no perder `app.inject()` en las pruebas, el id de petición y el rendimiento.

**Dónde vive NestJS y dónde no** (lo impone ESLint):

| Capa | ¿NestJS? | Contenido |
|---|---|---|
| `domain/` | **No** | Entidades y reglas puras |
| `application/` | **No** | Casos de uso (clases TypeScript normales), puertos (interfaces) y su **token de inyección** (`export const REPORT_REPOSITORY = Symbol('ReportRepository')`) |
| `infrastructure/` | Sí (`@Injectable`) | Adaptadores que implementan los puertos |
| `http/` | Sí | **Controladores**: reciben la petición, validan con `ZodValidationPipe(esquema de @gyde/contracts)` y llaman un caso de uso |
| `app.module.ts` | Sí | **Composition root**: enlaza cada token con su adaptador (`{ provide: REPORT_REPOSITORY, useClass: ... }`) y construye los casos de uso con `useFactory`, para que `application/` y `domain/` no conozcan el framework |

Reglas prácticas:

- Los **contratos siguen siendo zod** (`@gyde/contracts`): no hay DTO con `class-validator`.
- `@gyde/service-kit` ofrece lo común: `createService(AppModule, opciones)` (id de petición, filtro global que devuelve el sobre `ApiError`, `/healthz`, `/readyz`, guarda del token interno, logger que censura secretos), `ZodValidationPipe`, `notImplemented`, `HttpError`, `startService`.
- **Inyección explícita:** `esbuild` (tsup y Vitest) no emite metadatos de decoradores, así que **siempre** `@Inject(TOKEN)` en los constructores; nunca confíes en el tipo del parámetro.
- Los puertos que cruzan servicios usan `ResilientHttpClient` y el Circuit Breaker de `@gyde/resilience`, igual que antes.
- Los endpoints asíncronos responden `@HttpCode(202)`.
- El **Servicio Web sigue en Next.js** (App Router): es una aplicación full-stack, no un microservicio de API; aplica las mismas capas dentro de cada `modules/<nombre>`.

## Consecuencias

- Estructura estándar y conocida (módulos, controladores, DI) y los puertos se enlazan en un solo lugar.
- Se paga con más código de arranque y con una dependencia grande; el costo se concentra en `service-kit` y en el `app.module.ts` de cada servicio.
- Hay que recordar `@Inject(TOKEN)` en cada constructor: un olvido falla al arrancar con un error de Nest, no en silencio.
- `domain/` y `application/` siguen siendo TypeScript puro, así que se prueban sin Nest y la lógica sobrevive a un cambio de framework.

## Alternativas descartadas

- **Seguir con Fastify directo:** más liviano y ya implementado, pero el equipo pidió NestJS explícitamente.
- **NestJS con decoradores en toda la aplicación (`@Injectable` en casos de uso y dominio):** más corto, pero acopla la lógica al framework y rompe la regla de capas del ADR 0002.
- **Adaptador de Express:** más extendido, pero perdería `app.inject()` y el id de petición de Fastify que ya usan las pruebas.
