# @gyde/discovery

Cliente de **Service Discovery** (documento de arquitectura, patrón 2). Las instancias de los servicios aparecen y desaparecen con el autoescalado, así que nadie "hardcodea" una dirección: cada servicio se **registra** en el Service Registry y quien necesita llamar a otro le **pregunta** por una instancia saludable.

> **Estado:** API tipada y criterios de aceptación como pruebas pendientes. Implementación: **Área 1** (`docs/tasks/area-1-plataforma-y-borde.md`). El servidor es `services/registry`.

## Qué ofrece

| API | Para qué |
|---|---|
| `startRegistration()` | Registra la instancia y envía *heartbeats*; `stop()` la da de baja (se enchufa en `startService({ onReady, onShutdown })` de `@gyde/service-kit`) |
| `RegistryClient.resolve()` / `pick()` | Instancias saludables de un servicio; `pick` balancea en round-robin |
| `NoHealthyInstanceError` | No hay ninguna instancia saludable: error controlado o resultado degradado, **nunca** bloquear el pipeline del cliente (tabla 3.3) |

## Flujo (documento, sección 3.2)

1. El cliente (CLI / Action / extensión) dispara el análisis contra el **Gateway**.
2. El **Gateway** consulta al Registry por una instancia del servicio requerido.
3. El Registry responde con una instancia activa y saludable.
4. El Gateway envía la solicitud a través del **Circuit Breaker** de esa dependencia (`@gyde/resilience`), no directamente.
5. Si el circuito está cerrado, la instancia procesa y responde; el breaker registra éxito o fallo.
6. El resultado vuelve al cliente.

> **Decisión:** el discovery lo hace el **Gateway** (el cliente solo conoce su URL), coherente con el diagrama de contenedores y los de secuencia. Ver `docs/adr/`.

## Si el registry no responde

El cliente cae a las URLs estáticas del entorno (`staticUrls`) para que el desarrollo local y un registry caído no detengan el sistema.

## Criterios de aceptación

Como `it.todo` en `test/registry-client.test.ts`, tomados del flujo 3.2 y la tabla 3.3.
