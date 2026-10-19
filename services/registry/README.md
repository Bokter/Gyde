# registry: Service Registry + Health Checker

Mantiene la lista actualizada de **instancias activas y saludables** de cada servicio, para que nadie "hardcodee" direcciones que cambian con el autoescalado (patrón **Service Discovery**). Es un servicio de infraestructura muy pequeño: no aparece en el diagrama de contenedores, pero sí en el documento (sección 3.1: *Service Registry* y *Health Checker*).

> **Estado:** implementado (**Área 1**, `docs/tasks/area-1-plataforma-y-borde.md`). Cliente: `@gyde/discovery`.

- Puerto: `REGISTRY_PORT` (4100) · Solo red interna · Todas las rutas `/v1/*` exigen `x-internal-token`.

## API interna

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /v1/instances` | `ServiceRegistration` | `201` `InstanceInfo` |
| `PUT /v1/instances/:instanceId/heartbeat` | — | `200` `InstanceInfo` (`404` si no existe) |
| `DELETE /v1/instances/:instanceId` | — | `200` `{ "ok": true }` (también si no existe) |
| `GET /v1/services/:serviceName` | — | `ResolveResponse` (solo instancias saludables) |

## Comportamiento (documento, tablas 3.1 y 3.3)

- Una instancia sin *heartbeat* durante `INSTANCE_TTL_MS` se da de baja.
- El **Health Checker** consulta `/healthz` de cada instancia cada `HEALTH_CHECK_INTERVAL_MS`; tras `HEALTH_CHECK_MAX_FAILURES` fallos seguidos la elimina ("El Service Registry la elimina del listado, evitando que se sigan enrutando solicitudes hacia ella").
- Si no hay ninguna instancia sana, `resolve` devuelve lista vacía: el cliente (`@gyde/discovery`) lanza `NoHealthyInstanceError` y el Gateway responde un error controlado o un resultado degradado.
- El estado vive en memoria (basta para el MVP: las instancias se vuelven a registrar solas al reiniciar el registry).

## Estructura

```
src/domain/          entities/service-instance.entity.ts (ServiceInstance: heartbeat, sondas, expiración) y
                     repositories/registry.repository.ts (contrato RegistryRepository); solo imports relativos
src/application/     use-cases/*.use-case.ts (register, heartbeat, deregister, resolve), dto/ (tipos planos)
                     y errors.ts (InstanceNotFoundError, sin HTTP)
src/infrastructure/  repositories/in-memory-registry.repository.ts (InMemoryRegistryRepository) y
                     health-checker.ts (HealthChecker, bucle de sondas /healthz)
src/http/            controlador delgado, mappers/ (contrato <-> DTO) y application-error.interceptor.ts
src/app.module.ts    composition root: enlaza puertos con adaptadores y registra el interceptor (ADR 0011)
```

Las reglas de capas las aplica `pnpm lint` (ADR 0012).

## Desviación conocida

`GET /v1/services/:serviceName` no valida el nombre: `GET /v1/services/bogus` responde `200` con `{"serviceName":"bogus","instances":[]}` en lugar de `400`. Se conserva para no cambiar el contrato observable. El *cast* a `ServiceName` está aislado en `toResolveDto` (`src/http/mappers/registry.mapper.ts`). Lo fija la prueba de `test/characterization.test.ts` "resolve with an invalid serviceName is NOT validated today: 200 with an empty list".

## Excepciones de contrato en application

Ninguna: `application/` no importa `@gyde/contracts`.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `REGISTRY_PORT` | 4100 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `INSTANCE_TTL_MS` | 15000 | Tiempo sin heartbeat antes de dar de baja |
| `HEALTH_CHECK_INTERVAL_MS` | 5000 | Intervalo del Health Checker |
| `HEALTH_CHECK_MAX_FAILURES` | 3 | Fallos seguidos antes de eliminar |
