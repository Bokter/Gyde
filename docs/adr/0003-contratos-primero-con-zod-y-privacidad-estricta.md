# 0003. Contratos primero con zod y privacidad estricta

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

Siete servicios y tres clientes desarrollados en paralelo por cuatro personas necesitan un acuerdo ejecutable sobre qué se dicen. Además, el negocio promete que **el código fuente del cliente no sale de su entorno**.

## Decisión

Todo mensaje entre piezas se define **primero** como esquema zod en `packages/contracts`, y de ahí salen los tipos de TypeScript, las rutas (`ROUTES`), las cabeceras y los datos de muestra (`@gyde/contracts/samples`).

- Los esquemas de lo que envía el cliente (`AnalysisRequest` y sus partes) son **`strictObject`**: cualquier campo desconocido se rechaza con `400`. Es lo que impone la privacidad.
- Los servicios validan en la frontera (`parseOrThrow`) y dentro usan los tipos ya validados.
- Un cambio de contrato es un PR pequeño (`feat(contracts): ...`) revisado por **otra área**; los incompatibles llevan `!`.
- Cada área trabaja contra mocks construidos con las muestras mientras el servicio vecino no existe.

## Consecuencias

- Menos integración tardía: los desacuerdos aparecen al cambiar el contrato, no el último día.
- Una pequeña fricción al añadir campos: es deliberada en `AnalysisRequest`.

## Alternativas descartadas

- **OpenAPI escrito a mano:** se desincroniza del código.
- **Tipos compartidos sin validación en ejecución:** no protegen la frontera ni la privacidad.
