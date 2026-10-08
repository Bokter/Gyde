# @gyde/service-kit

Arranque común de los servicios del backend, para que los siete arranquen igual y nadie reescriba lo mismo.

## Qué incluye

| Pieza | Para qué |
|---|---|
| `buildApp()` | Instancia de Fastify con id de petición (`x-request-id`), sobre de error estándar (`ApiError`), `/healthz` (liveness) y `/readyz` (readiness con chequeos propios) |
| `startService()` | Escucha y apaga ordenadamente con SIGTERM/SIGINT; ganchos `onReady` / `onShutdown` |
| `HttpError` | Lánzalo desde cualquier handler: se convierte en la respuesta con el código y estado correctos |
| `parseOrThrow()` | Valida entrada no confiable con un esquema de `@gyde/contracts` (400 con la ruta que falla) |
| `loadConfig()` / `baseEnv` | Variables de entorno validadas con zod; falla al arrancar con un mensaje legible |
| `createLogger()` | Logger JSON (pino) que **censura secretos**: `apiKey`, `authorization`, `token`, `password`, `secret`… |
| `requireInternalToken()` | Protege las rutas `/internal/*` con `INTERNAL_SERVICE_TOKEN` (comparación en tiempo constante) |
| `registerStubRoutes()` | Registra los endpoints del contrato respondiendo `501 not_implemented` (ya validan el cuerpo) |

## Uso (así luce el `main.ts` de cualquier servicio)

```ts
import { ROUTES } from '@gyde/contracts';
import { baseEnv, buildApp, createLogger, loadConfig, registerStubRoutes, startService } from '@gyde/service-kit';
import { z } from 'zod';

const config = loadConfig(baseEnv.extend({ GATEWAY_PORT: z.coerce.number().default(4000) }));
const logger = createLogger({ name: 'gateway', level: config.LOG_LEVEL });
const app = buildApp({ name: 'gateway', logger, readiness: { /* db: () => pool.query('select 1') */ } });

registerStubRoutes(app, [{ method: 'POST', url: ROUTES.gateway.analyses }]);

await startService(app, { port: config.GATEWAY_PORT });
```

## Reglas

- **Nunca** registres un secreto con `console.log` ni lo pongas en un mensaje de error. El logger censura por nombre de campo, pero un secreto dentro de un string no se puede detectar.
- Las rutas `/internal/*` llevan `requireInternalToken` y **no** se exponen en el gateway.
- El auto-registro en el Service Registry se enchufa en `startService({ onReady, onShutdown })` cuando exista `@gyde/discovery` (tarea del Área 1).
