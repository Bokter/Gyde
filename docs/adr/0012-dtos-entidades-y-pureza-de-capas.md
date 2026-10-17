# 0012. DTOs, entidades y pureza de capas en los servicios NestJS

- **Estado:** Propuesta
- **Fecha:** 2026-10-17

## Contexto

Una auditoría de los seis servicios contra la guía "Arquitectura limpia aplicada en NestJS" y los ADR [0002](0002-arquitectura-limpia-y-reglas-de-capas.md), [0003](0003-contratos-primero-con-zod-y-privacidad-estricta.md) y [0011](0011-nestjs-como-framework-de-los-servicios.md) encontró que el código no cumple lo que los documentos prometen:

- Casi no hay entidades (solo `ServiceInstance`); no hay DTOs ni mappers de aplicación.
- 18 de 21 archivos de `domain/` importan `@gyde/contracts` y dos usan Zod; hay `node:crypto` y `spdx-expression-parse` en dominio.
- `application/` lanza `HttpError` o importa `@gyde/service-kit`, `@gyde/resilience` y `node:crypto` (gateway, registry, llm-analysis, reports).
- `reports.controller.ts` llama al dominio sin caso de uso.
- Las reglas actuales (`layer-boundaries.mjs`) solo prohíben capas exteriores y librerías de infraestructura; no impiden contratos, Zod ni `node:*`.

El framework no es el problema (ya es NestJS). Falta el contenido de las capas. La línea base de violaciones está en `context/refactor/BASELINE.md` (31 violaciones con `tooling/eslint/purity.config.mjs`).

## Decisión

Resumen de las secciones 1 a 6 de `CONVENTIONS.md` del plan de refactor:

- **`domain/` solo con imports relativos** dentro de `domain/`: sin `@gyde/*`, `zod`, `@nestjs/*`, `node:*` ni librerías. Lo que necesite de afuera (id, hora, parser SPDX) entra por argumento o por una interfaz definida en el dominio e implementada en `infrastructure/`. Las constantes de contrato se copian localmente.
- **`application/`** importa `domain/` y relativos propios; sin `zod`, `@gyde/service-kit`, `@gyde/resilience`, `@gyde/discovery`, `@nestjs/*`, `node:*`, `infrastructure/` ni `http/`.
- **DTO = tipo plano** (`export type XxxDto`) en `application/dto/`, sin decoradores ni Zod. La validación en runtime sigue en el borde con `ZodValidationPipe(Schema)`; mappers puros en `http/mappers/` convierten contrato ↔ DTO.
- **Entidades por servicio** donde haya reglas e invariantes (fábricas `create`/`rehydrate`); no hay paquete de dominio compartido. Los patrones existentes (Template Method, Decorator) se conservan.
- **Errores de aplicación** en `application/errors.ts` (`extends Error` con `code`, sin HTTP) y un filtro en `http/application-error.filter.ts` que los traduce a `HttpError` con el mismo status, código y mensaje de hoy.
- **Controladores delgados**: validar → mapear a DTO → caso de uso → mapear a respuesta.
- **Sin cambios de contrato externo**: rutas, códigos HTTP, payloads y cabeceras no cambian; no se tocan `packages/contracts` ni `packages/service-kit`.
- **Lint estricto** en `tooling/eslint/purity.config.mjs`, ejecutable por servicio y conectado a `pnpm lint` en WP-3.

### Allowlist de tipos de contrato en application

Un caso de uso de paso puede usar `import type { ... } from '@gyde/contracts'` solo si no crea ni modifica una entidad y su entrada y salida son exactamente un tipo del contrato. Nunca valores (`SEVERITY_ORDER`, schemas Zod).

Como los paquetes de servicio no pueden editar este ADR (archivo compartido), **cada servicio registra sus excepciones en `services/<svc>/README.md`, sección "Excepciones de contrato en application"** (archivo y tipo). El paquete de integración (WP-3) las consolida aquí.

_(Pendiente: la tabla se completa en WP-3.)_

## Consecuencias

- El dominio se prueba sin Nest, sin BD y sin contratos; el código coincide con lo que dicen ADR 0002 y CONTRIBUTING.
- Se paga con más archivos (DTOs, mappers, errores, filtros) y con mapeos explícitos en los bordes.
- Los ADR 0002, 0003 y 0011 llevarán una nota de actualización que apunte a este (WP-3).
- Queda abierta la deuda aceptada: los casos de uso de paso con `import type` de contratos.

## Alternativas descartadas

- **DTO como clase con `class-validator`:** duplica cada schema Zod (ADR 0003), hay que replicar `strictObject` y cambia el formato `details` del 400.
- **DTO para todo caso de uso:** mappers vacíos en los casos de paso; se prefiere la allowlist explícita.
- **Paquete `domain-kernel` compartido:** acopla servicios que hoy solo se hablan por HTTP; cada servicio tiene sus propios tipos aunque compartan nombre.
- **Migrar a Jest:** sin beneficio para esta decisión; se mantiene Vitest.
