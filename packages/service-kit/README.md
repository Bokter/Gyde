# @gyde/service-kit

Arranque común de los servicios del backend, para que los seis arranquen igual y nadie reescriba lo mismo. Los servicios usan **NestJS sobre el adaptador de Fastify** ([ADR 0011](../../docs/adr/0011-nestjs-como-framework-de-los-servicios.md)); este paquete concentra todo lo que no es lógica propia de un servicio.

## Qué incluye

| Pieza | Para qué |
|---|---|
| `createService(AppModule, opciones)` | Crea la aplicación NestJS: id de petición (`x-request-id`), **filtro global** que convierte cualquier error en el sobre estándar (`ApiError`), `/healthz` (liveness), `/readyz` (readiness con chequeos propios), logger que censura secretos y la guarda del token interno |
| `startService(app, opciones)` | Escucha y apaga ordenadamente con SIGTERM/SIGINT; ganchos `onReady` / `onShutdown` |
| `ZodValidationPipe(esquema)` | Valida una parte de la petición con un esquema de `@gyde/contracts`: `@Body(new ZodValidationPipe(Esquema))` (400 con la ruta que falla). Reemplaza a los DTO con class-validator |
| `notImplemented(método, ruta)` | El cuerpo de un controlador que ya está en el contrato pero no se construye todavía: responde `501 not_implemented` |
| `HttpError` | Lánzalo desde un controlador o adaptador: el filtro global lo convierte en la respuesta con el código y estado correctos |
| `parseOrThrow()` | Valida entrada no confiable con un esquema (lo usa el pipe; úsalo también fuera de HTTP) |
| `loadConfig()` / `baseEnv` | Variables de entorno validadas con zod; falla al arrancar con un mensaje legible |
| `createLogger()` | Logger JSON (pino) que **censura secretos**: `apiKey`, `authorization`, `token`, `password`, `secret`… También recibe los logs internos de NestJS |
| `APP_CONFIG` | Token de inyección de la configuración validada (se pasa con `config` a `createService`) |
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
await startService(app, { port: config.REPORTS_PORT });
```

En las pruebas no se escucha en un puerto: `const app = await createService(...)`, `app.inject({ method: 'GET', url: '/healthz' })` y `afterAll(() => app.close())`.

## Reglas

- **Nunca** registres un secreto con `console.log` ni lo pongas en un mensaje de error. El logger censura por nombre de campo, pero un secreto dentro de un string no se puede detectar.
- **`@Inject(TOKEN)` explícito** en cada constructor: `esbuild` (tsup y Vitest) no emite los metadatos de tipos que NestJS usaría para inyectar por el tipo del parámetro.
- `domain/` y `application/` **no importan NestJS** (ESLint lo impone): los casos de uso son clases normales que se construyen con `useFactory` en `app.module.ts`.
- Los servicios con rutas `/internal/*` pasan `internalToken` y esas rutas **no** se exponen en el gateway. El registry guarda `/v1/*` con `internalPrefixes: ['/v1/']`.
- Los endpoints que trabajan en segundo plano responden `@HttpCode(202)` de inmediato.
- El auto-registro en el Service Registry se enchufa en `startService({ onReady, onShutdown })` cuando exista `@gyde/discovery` (tarea del Área 1).
