# registry: Service Registry + Health Checker

Mantiene la lista actualizada de **instancias activas y saludables** de cada servicio, para que nadie "hardcodee" direcciones que cambian con el autoescalado (patrón **Service Discovery**). Es un servicio de infraestructura muy pequeño: no aparece en el diagrama de contenedores, pero sí en el documento (sección 3.1: *Service Registry* y *Health Checker*).

> **Estado:** esqueleto ejecutable (501). Implementación: **Área 1** (`docs/tasks/area-1-plataforma-y-borde.md`). Cliente: `@gyde/discovery`.

- Puerto: `REGISTRY_PORT` (4100) · Solo red interna · Todas las rutas `/v1/*` exigen `x-internal-token`.

## API interna

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /v1/instances` | `ServiceRegistration` | `201` |
| `PUT /v1/instances/:instanceId/heartbeat` | — | `204` (`404` si no existe) |
| `DELETE /v1/instances/:instanceId` | — | `204` |
| `GET /v1/services/:serviceName` | — | `ResolveResponse` (solo instancias saludables) |

## Comportamiento (documento, tablas 3.1 y 3.3)

- Una instancia sin *heartbeat* durante `INSTANCE_TTL_MS` se da de baja.
- El **Health Checker** consulta `/healthz` de cada instancia cada `HEALTH_CHECK_INTERVAL_MS`; tras `HEALTH_CHECK_MAX_FAILURES` fallos seguidos la elimina ("El Service Registry la elimina del listado, evitando que se sigan enrutando solicitudes hacia ella").
- Si no hay ninguna instancia sana, `resolve` devuelve lista vacía: el cliente (`@gyde/discovery`) lanza `NoHealthyInstanceError` y el Gateway responde un error controlado o un resultado degradado.
- El estado vive en memoria (basta para el MVP: las instancias se vuelven a registrar solas al reiniciar el registry).

## Estructura sugerida

```
src/domain/          InstanceRegistry (registro con TTL, reglas puras y reloj inyectable)
src/application/     casos de uso (register, heartbeat, deregister, resolve) y puerto HealthProbe
src/infrastructure/  HealthProbe sobre HTTP y el bucle del Health Checker
src/http/            rutas (ya declaradas como stubs)
```

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `REGISTRY_PORT` | 4100 | Puerto |
| `INTERNAL_SERVICE_TOKEN` | — | Obligatoria |
| `INSTANCE_TTL_MS` | 15000 | Tiempo sin heartbeat antes de dar de baja |
| `HEALTH_CHECK_INTERVAL_MS` | 5000 | Intervalo del Health Checker |
| `HEALTH_CHECK_MAX_FAILURES` | 3 | Fallos seguidos antes de eliminar |
