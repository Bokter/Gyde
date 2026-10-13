# @gyde/service-kit

Arranque común de los servicios del backend, para que los seis arranquen igual y nadie reescriba lo mismo. Los servicios usan **NestJS sobre el adaptador de Fastify** ([ADR 0011](../../docs/adr/0011-nestjs-como-framework-de-los-servicios.md)); este paquete concentra todo lo que no es lógica propia de un servicio.

## Qué incluye

| Pieza | Para qué |
|---|---|
| `createService(AppModule, opciones)` | Crea la aplicación NestJS: id de petición (`x-request-id`), **filtro global** que convierte cualquier error en el sobre estándar (`ApiError`), `/healthz` (liveness), `/readyz` (readiness con chequeos propios), logger que censura secretos y la guarda del token interno |
| `startService(app, opciones)` | Escucha, auto-registra la instancia en el Service Registry (`startRegistration`), y apaga ordenadamente con SIGTERM/SIGINT desregistrándola; ganchos `onReady` / `onShutdown` |
| `ResilientHttpClient(opciones)` | Cliente HTTP resiliente para comunicación entre servicios: resolución vía `RegistryClient`, Circuit Breaker por dependencia (`createBreakerFromEnv`), soporte de caché local (`FallbackCache`), respaldo a `*_URL` estáticas, propagación de `x-request-id` y `x-internal-token`. Lanza `NoHealthyInstanceError` (traducido a 503 `upstream_unavailable`) |
| `ZodValidationPipe(esquema)` | Valida una parte de la petición con un esquema de `@gyde/contracts`: `@Body(new ZodValidationPipe(Esquema))` (400 con la ruta que falla). Reemplaza a los DTO con class-validator |
| `notImplemented(método, ruta)` | El cuerpo de un controlador que ya está en el contrato pero no se construye todavía: responde `501 not_implemented` |
| `HttpError` | Lánzalo desde un controlador o adaptador: el filtro global lo convierte en la respuesta con el código y estado correctos |
| `parseOrThrow()` | Valida entrada no confiable con un esquema (lo usa el pipe; úsalo también fuera de HTTP) |
| `loadConfig()` / `baseEnv` | Variables de entorno validadas con zod; falla al arrancar con un mensaje legible |
| `createLogger()` | Logger JSON (pino) que **censura secretos**: `apiKey`, `authorization`, `token`, `password`, `secret`… También recibe los logs internos de NestJS |
| `APP_CONFIG` | Token de inyección de la configuración validada (se pasa con `config` a `createService`) |
| `SERVICE_METADATA` | Token de inyección con el nombre y versión del servicio (`{ name, version }`) |
| `requireInternalToken()` | La comparación en tiempo constante del token interno, por si necesitas comprobarlo a mano |

## Cómo luce un servicio

```ts
// src/http/reports.controller.ts  (capa http: recibe, valida y llama a un caso de uso)
@Controller()
export class ReportsController {
  constructor(@Inject(CreateAnalysis) private readonly createAnalysis: CreateAnalysis) {}

  @Post(ROUTES.reports.createAnalysis)
  @HttpCode(202)
  create(@Body(new ZodValidationPipe(CreateAnalysisJob)) job: CreateAnalysisJob) {
    return this.createAnalysis.execute(job);
  }
}

// src/app.module.ts  (composition root: único lugar que conoce las implementaciones)
@Module({
  controllers: [ReportsController],
  providers: [
    { provide: REPORT_REPOSITORY, useClass: PostgresReportRepository },
    {
      provide: CreateAnalysis,
      useFactory: (repository: ReportRepository) => new CreateAnalysis({ repository }),
      inject: [REPORT_REPOSITORY],
    },
  ],
})
export class AppModule {}

// src/main.ts
const config = loadConfig(configSchema);
const logger = createLogger({ name: 'reports', level: config.LOG_LEVEL });
const app = await createService(AppModule, {
  name: 'reports',
  logger,
  config,
  internalToken: config.INTERNAL_SERVICE_TOKEN, // guarda todo /internal/*, incluso rutas inexistentes
});

// startService realiza el auto-registro en el Service Registry automáticamente si
// SERVICE_BASE_URL, REGISTRY_URL e INTERNAL_SERVICE_TOKEN están definidos en config.
await startService(app, { port: config.REPORTS_PORT });
```

## Cliente HTTP Resiliente (`ResilientHttpClient`)

Para llamar a otros servicios (por ejemplo, desde el gateway hacia `web` o `reports`, o desde `retrieval` hacia `normalization`), utiliza `ResilientHttpClient`:

```ts
import { ResilientHttpClient } from '@gyde/service-kit';
import { RegistryClient } from '@gyde/discovery';

// 1. Instancia el RegistryClient y el ResilientHttpClient
const registryClient = new RegistryClient({
  registryUrl: config.REGISTRY_URL,
  internalToken: config.INTERNAL_SERVICE_TOKEN,
});

const httpClient = new ResilientHttpClient({
  serviceName: 'gateway',
  resolver: registryClient,
  internalToken: config.INTERNAL_SERVICE_TOKEN,
  fallbackUrls: {
    reports: config.REPORTS_URL,
    web: config.WEB_URL,
  },
});

// 2. Realiza peticiones tipadas propagando x-request-id
const jobResult = await httpClient.postJson('reports', '/internal/analyses', jobPayload, {
  requestId: req.id,
});

// 3. O realiza llamadas fetch directas (cuando necesitas inspeccionar status o headers)
const response = await httpClient.fetch('web', '/internal/api-keys/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ apiKey }),
  requestId: req.id,
});
```

### Comportamiento y Resiliencia

1. **Resolución dinámica**: Consulta `RegistryClient.pick(serviceName)`. Si el registry está caído o no conoce la instancia, recurre a `fallbackUrls` (las `*_URL` estáticas del compose).
2. **Error controlado**: Si ninguna instancia sana responde, lanza `NoHealthyInstanceError`, que `ApiExceptionFilter` traduce automáticamente a `503 upstream_unavailable`.
3. **Circuit Breaker**: Cada dependencia tiene su propio Circuit Breaker (`caller->target`) configurado mediante las variables `CB_*`. Tras fallas consecutivas o tasa de error superada, el circuito se abre y protege al sistema.
4. **Caché de respaldo (`FallbackCache`)**: Si se pasa un `FallbackCache`, las respuestas válidas se almacenan y pueden servirse cuando la dependencia se caiga.
5. **Propagación de contexto**: Inyecta automáticamente `x-internal-token` y `x-request-id`.
6. **Errores sin cuerpo del vecino**: `getJson`, `postJson` y `UpstreamServiceError` usan mensajes genéricos (`reports returned 404`), porque el mensaje llega al cliente. El cuerpo de la respuesta fallida se registra (truncado a 500 caracteres) en el `logger` opcional del cliente: `new ResilientHttpClient({ ..., logger })`.

## Variables de entorno de auto-registro

| Variable | Tipo | Descripción |
|---|---|---|
| `SERVICE_BASE_URL` | URL | URL alcanzable de esta instancia en la red interna (ej. `http://reports:4500`). |
| `INSTANCE_ID` | String | Identificador único de la instancia (ej. `reports-1`). Por defecto genera `${serviceName}-${uuid}`. |
| `REGISTRY_URL` | URL | Dirección del Service Registry (ej. `http://registry:4100`). |
| `INTERNAL_SERVICE_TOKEN` | String | Token secreto compartido para autenticación entre servicios (`x-internal-token`). |
| `HEARTBEAT_INTERVAL_MS` | Number | Intervalo de latidos de vida (por defecto `10000` ms). |

## Reglas

- **Nunca** registres un secreto con `console.log` ni lo pongas en un mensaje de error. El logger censura por nombre de campo, pero un secreto dentro de un string no se puede detectar.
- **`@Inject(TOKEN)` explícito** en cada constructor: `esbuild` (tsup y Vitest) no emite los metadatos de tipos que NestJS usaría para inyectar por el tipo del parámetro.
- `domain/` y `application/` **no importan NestJS** (ESLint lo impone): los casos de uso son clases normales que se construyen con `useFactory` en `app.module.ts`.
- Los servicios con rutas `/internal/*` pasan `internalToken` y esas rutas **no** se exponen en el gateway. El registry guarda `/v1/*` con `internalPrefixes: ['/v1/']`.
- Los endpoints que trabajan en segundo plano responden `@HttpCode(202)` de inmediato.
- El auto-registro en el Service Registry se realiza automáticamente en `startService` cuando `SERVICE_BASE_URL` está configurado.
