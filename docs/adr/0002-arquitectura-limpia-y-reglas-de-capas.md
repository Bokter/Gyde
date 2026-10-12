# 0002. Arquitectura limpia por servicio y reglas de capas impuestas por lint

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

La prioridad del proyecto es una arquitectura limpia con buena separación de responsabilidades, y cuatro personas van a escribir código en paralelo. Una regla que solo está en un documento se rompe al segundo día.

## Decisión

Cada servicio se organiza en capas con las dependencias apuntando hacia adentro:

```
http → application → domain          infrastructure → application
```

- `domain`: entidades y reglas puras, sin I/O ni frameworks.
- `application`: casos de uso y **puertos** (interfaces).
- `infrastructure`: adaptadores que implementan los puertos (base de datos, HTTP, Stripe, proveedores de IA).
- `http`: rutas que validan con `@gyde/contracts` y llaman casos de uso.
- `main.ts` es el **composition root**: el único lugar que conoce implementaciones concretas.

El Servicio Web aplica las mismas capas **dentro de cada módulo** (`modules/<nombre>/{domain,application,infrastructure}`).

Las reglas se **imponen con ESLint** (`tooling/eslint/layer-boundaries.mjs`, `no-restricted-imports`): `domain` y `application` no pueden importar capas exteriores ni librerías de infraestructura (Fastify, Next, Stripe, bases de datos, SDKs de IA).

## Consecuencias

- La lógica de negocio se prueba sin red ni base de datos, con puertos falsos.
- Cambiar de proveedor (por ejemplo, de LLM) es escribir un adaptador nuevo.
- Hay algo más de estructura inicial (carpetas y puertos); es el precio de poder trabajar en paralelo sin pisarse.

## Alternativas descartadas

- **Convención sin comprobación automática:** se erosiona con el primer apuro.
- **Un plugin de límites de ESLint o dependency-cruiser:** más potentes, pero añaden una dependencia y su configuración; las reglas nativas bastan para cuatro capas.
