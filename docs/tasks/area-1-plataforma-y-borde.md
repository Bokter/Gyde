# Área 1: Plataforma, Gateway y Resiliencia

> **Responsable:** _(asignar)_ · Lee primero el [plan del equipo](00-resumen.md).

## Objetivo

Que las piezas del sistema **se hablen de forma confiable y degraden con gracia**. Implementas los dos patrones **arquitectónicos** del documento, **Circuit Breaker** y **Service Discovery**, el **API Gateway** (único punto de entrada) y mantienes viva la plataforma de desarrollo (Docker y CI).

Eres el primer cuello de botella: las Áreas 3 y 4 necesitan tu `CircuitBreaker` el **día 1**. Entrégalo en PRs pequeños.

## Lecturas obligatorias

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) · [Visión general](../architecture/00-vision-general.md) · [Flujos](../architecture/02-flujos.md) (1 a 4) · [Patrones](../architecture/03-patrones.md) (Circuit Breaker y Service Discovery) · [ADR 0005](../adr/0005-discovery-en-el-gateway-y-registry-como-servicio.md) · README de `packages/resilience`, `packages/discovery`, `services/registry`, `services/gateway` e [`infra`](../../infra/README.md).

## Qué construyes y cómo está hoy

| Módulo | Estado hoy | Tu trabajo |
|---|---|---|
| `packages/resilience` | API tipada y `it.todo` | Implementar `CircuitBreaker`, `MemoryFallbackCache`, `FileFallbackCache` |
| `services/registry` | Stubs `501`, token interno exigido en `/v1/*` | Implementar registro, heartbeat, TTL y Health Checker |
| `packages/discovery` | `NoHealthyInstanceError` real; el resto TODO | Implementar `RegistryClient` y `startRegistration` |
| `services/gateway` | Stubs `501` que validan el cuerpo | Autenticación, límites, enrutado con discovery y breaker |
| `packages/service-kit` | v0 funcional (NestJS sobre Fastify) | Integrar discovery y un cliente HTTP resiliente reutilizable |
| `infra/` y CI | `compose.yaml` válido, imágenes **sin construir** | Construirlas, corregirlas y dejar el CI verde |

## Archivos

**Sí tocas:** `packages/resilience/**` · `packages/discovery/**` · `services/registry/**` · `services/gateway/**` · `packages/service-kit/**` (coordina cambios) · `infra/**` · `.github/workflows/**` · `docs/workflow/**`.

**No tocas** (pide un PR al dueño): `services/web`, `normalization`, `retrieval`, `llm-analysis`, `reports`, `apps/**`, `packages/analysis-engine`, `packages/design-tokens`. Para `packages/contracts`, abre un PR pequeño y pide revisión a otra área.

## Contratos

Consumes y produces los de `@gyde/contracts`: `ROUTES.gateway.*`, `ROUTES.registry.*`, `ServiceRegistration`, `ResolveResponse`, `VerifyApiKeyRequest/Response`, `AuthVerifyResponse`, `CreateAnalysisJob`, `AnalysisAccepted`, `Report`, `ApiError`, `HEADERS`.

## Entregables y criterios de aceptación

### 1. `resilience` (día 1, prioridad máxima)

- [ ] `CircuitBreaker` cumple el diagrama de estados (cerrado → abierto → semiabierto) y **todos los `it.todo`** de `packages/resilience/test/circuit-breaker.test.ts` son pruebas reales y verdes, usando el reloj inyectable `now`.
- [ ] Abre con 5 fallos seguidos **o** 50 % de fallos en la ventana; en abierto responde de inmediato con el *fallback* sin llamar a la dependencia; sin fallback lanza `CircuitOpenError`.
- [ ] Una llamada más lenta que `callTimeoutMs` cuenta como fallo.
- [ ] `MemoryFallbackCache` (LRU + TTL) y `FileFallbackCache` (persiste entre reinicios) con pruebas.
- [ ] Función `createBreakerFromEnv(name)` que lee los `CB_*` de `.env.example`.
- [ ] El README del paquete muestra un ejemplo real, no el previsto.

### 2. `registry` y `discovery` (días 1 y 2)

- [ ] El registry cumple su README: `POST /v1/instances`, `PUT .../heartbeat`, `DELETE`, `GET /v1/services/:name` (solo saludables); TTL por `INSTANCE_TTL_MS`; **Health Checker** que consulta `/healthz` cada `HEALTH_CHECK_INTERVAL_MS` y elimina tras `HEALTH_CHECK_MAX_FAILURES` fallos. Todos sus `it.todo` verdes.
- [ ] `RegistryClient`: `register`, `heartbeat`, `deregister`, `resolve`, `pick` (round-robin), caché breve de `resolve`, **respaldo a URLs estáticas** (`*_URL`) si el registry no responde, y `NoHealthyInstanceError` si no hay instancias.
- [ ] `startRegistration` registra y mantiene el heartbeat; `stop()` da de baja. Integrado en `startService({ onReady, onShutdown })` de `service-kit`: **cada servicio se autoregistra** (`serviceName`, `instanceId`, `baseUrl`).
- [ ] Un `ResilientHttpClient` en `service-kit` (resolver instancia → breaker → `fetch` → caché de respaldo) que reutilizan Reports, Retrieval, llm-analysis y Normalization.

### 3. `gateway` (días 2 y 3)

- [ ] **Autenticación:** `Authorization: Bearer <key>` → `POST /internal/api-keys/verify` en Web (`VerifyApiKeyResponse`), con caché corta (≈60 s); `401` si no es válida o fue revocada (tras expirar la caché).
- [ ] `GET /v1/auth/verify` devuelve `AuthVerifyResponse` (plan y permisos).
- [ ] **Límites:** análisis por mes según `Entitlements` → `402 plan_limit_exceeded`; límite de tasa por key → `429 rate_limited` (en memoria basta para el MVP).
- [ ] `POST /v1/analyses` → Reports `POST /internal/analyses` con un `CreateAnalysisJob` (tenant + permisos + request) y responde `202`; `GET /v1/analyses/:id` y `/markdown` → Reports. Las respuestas se validan con los esquemas.
- [ ] Todas las llamadas salen por discovery + breaker; sin instancia sana → `503 upstream_unavailable` controlado (nunca se cuelga).
- [ ] Propaga `x-request-id` y `x-gyde-tenant-id`. **Nunca** enruta `/internal/*` (la prueba existente sigue verde). Los errores no filtran detalles internos.
- [ ] Pruebas con servidores simulados (Fastify mínimo, como `devDependency`, en puertos efímeros) para Web, Reports y el registry.
- [ ] Todos los `it.todo` de `services/gateway/test/app.test.ts` convertidos.

### 4. Infraestructura y CI (día 3, y mantenimiento)

- [ ] `docker build -f infra/docker/dev.Dockerfile --target check .` pasa. Si falla, corrígelo y documenta qué fue.
- [ ] `docker compose -f infra/compose/compose.yaml up` deja PostgreSQL y los 6 servicios **saludables**; `watch` sincroniza cambios. Marca `infra/README.md` como verificado.
- [ ] Cada `services/*/Dockerfile` construye y arranca (`docker build -f services/<x>/Dockerfile .`).
- [ ] El CI (`.github/workflows/ci.yml`) está verde en un PR y `dev` y `main` quedan protegidas según [`docs/workflow/configuracion-github.md`](../workflow/configuracion-github.md).
- [ ] (Si hay tiempo) un script de humo E2E en `infra/scripts/` que recorra el camino feliz.

## Dependencias con otras áreas

| Necesitas | De | Qué haces mientras tanto |
|---|---|---|
| `POST /internal/api-keys/verify` | Área 2 | Servidor Fastify mínimo simulado que devuelve `VerifyApiKeyResponse` |
| Reports `create` y `get` | Área 4 | Servidor simulado con `@gyde/contracts/samples` |

| Entregas | A quién | Cuándo |
|---|---|---|
| `CircuitBreaker` y `MemoryFallbackCache` | Áreas 3 y 4 | **Fin del día 1** |
| `RegistryClient` y `ResilientHttpClient` | Todos | Día 2 |

## Orden sugerido

1. **Día 1:** `CircuitBreaker` y cachés (PR por pieza) → registry.
2. **Día 2:** `RegistryClient`, `startRegistration`, `ResilientHttpClient` → autenticación del gateway.
3. **Día 3:** enrutado y límites del gateway → construir y corregir las imágenes de Docker.
4. **Día 4:** integración E2E con todos.
5. **Día 5:** pulido, métricas simples en logs, documentación.

## Si hay retraso

Cachés de archivo mínimos · límites en memoria sin persistencia · sin Redis · sin métricas · un solo algoritmo de balanceo (round-robin).

## Prompt para tu asistente

El prompt completo (contexto, arquitectura, patrones, reglas de coherencia entre documentos y código, flujo con `dev` y los detalles de esta área) está en [`prompts/prompt-area-1-plataforma-y-borde.md`](prompts/prompt-area-1-plataforma-y-borde.md). Pégalo al empezar tu sesión con Claude.
