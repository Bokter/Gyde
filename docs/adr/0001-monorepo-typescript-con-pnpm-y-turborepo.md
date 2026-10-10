# 0001. Monorepo TypeScript con pnpm y Turborepo

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

Los documentos describen siete contenedores, tres clientes y varias librerías compartidas, pero **no definen con qué se construye Gyde** (Unity/C# y Unreal/C++ son los motores que se analizan, no el stack del producto). Somos 4 personas con 5 días. La GitHub Action y la extensión de VS Code son nativas de JavaScript/TypeScript, y el SDK de Stripe es de primera clase en Node.

## Decisión

TypeScript en todo el proyecto, en un **monorepo** con **pnpm workspaces** y **Turborepo**:

- Servicios con **NestJS sobre Fastify** ([ADR 0011](0011-nestjs-como-framework-de-los-servicios.md)), validación con **zod**, pruebas con **Vitest**; Servicio Web con **Next.js**; datos en **PostgreSQL**.
- **Una sola versión de cada dependencia compartida** mediante el catálogo de pnpm (`pnpm-workspace.yaml`).
- Los paquetes compartidos se publican **como código fuente** en el workspace; cada servicio los empaqueta con `tsup` (dejando las dependencias de npm como externas, declaradas en su `package.json`).
- TypeScript queda en **~6.0.x** porque `typescript-eslint` aún no soporta 6.1 o superior.
- pnpm 11 trata como error un script de instalación no aprobado: `esbuild` está aprobado en `allowBuilds`.

## Consecuencias

- Un solo lenguaje y un solo juego de herramientas para las cuatro personas; los contratos (zod) se comparten tal cual entre cliente y servidores.
- Un `pnpm install` resuelve todo; Turborepo ordena y cachea `build`, `typecheck` y `test`.
- Se renuncia a librerías de otros ecosistemas (por ejemplo, de scraping o de LLM en Python); se compensa con SDKs de Node.

## Alternativas descartadas

- **Python (FastAPI) + TypeScript:** más cómodo para scraping y LLM, pero la Action y la extensión van en TypeScript igualmente: dos toolchains, dos CI y más fricción entre áreas.
- **.NET (C#) + TypeScript:** calza con la notación del documento y con el mundo Unity, pero también obliga a TypeScript para Action y extensión.
