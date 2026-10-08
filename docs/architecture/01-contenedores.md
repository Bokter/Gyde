# Contenedores

Siete contenedores de backend (seis del diagrama original más el registry) y la app web, más las apps que corren en el entorno del cliente. Los esquemas de cada mensaje están en [`@gyde/contracts`](../../packages/contracts/README.md); las rutas, en `ROUTES`.

Puertos de desarrollo (ver `.env.example`): web 3000 · gateway 4000 · registry 4100 · normalization 4200 · retrieval 4300 · llm-analysis 4400 · reports 4500 · PostgreSQL 5432.

## Resumen

| Servicio | Responsabilidad | Datos propios | Llama a | La llaman | Área |
|---|---|---|---|---|---|
| `gateway` | Autentica la API key, límites del plan, enruta | — (caché en memoria) | web, reports, registry | CLI, Action, extensión | 1 |
| `registry` | Service Registry + Health Checker | en memoria | cada instancia (`/healthz`) | todos (vía `@gyde/discovery`) | 1 |
| `web` | UI, Stripe, API keys, llaves LLM de los estudios | schema `web` | Stripe | gateway, llm-analysis, Stripe (webhook) | 2 |
| `normalization` | Ingiere y normaliza fuentes externas | schema `normalization` | fuentes externas | retrieval | 3 |
| `retrieval` | Análisis determinístico y evidencia | — | normalization, reports, llm-analysis | reports | 3 |
| `llm-analysis` | Interpreta y correlaciona con IA (BYOK) | — | web, proveedores de IA, reports | retrieval | 4 |
| `reports` | Orquesta el análisis y arma el reporte | schema `reports` | retrieval | gateway, retrieval, llm-analysis | 4 |

Cada llamada saliente de la tabla va **detrás de un Circuit Breaker** y, hacia otros servicios, **resolviendo la instancia en el registry**.

## gateway

Único punto de entrada público. API pública en `/v1/*` autenticada con `Authorization: Bearer <API key>`; **nunca** enruta `/internal/*`.

| Ruta | Descripción |
|---|---|
| `GET /v1/auth/verify` | Valida la key y devuelve plan y permisos (primer paso del cliente) |
| `POST /v1/analyses` | Crea un análisis (`AnalysisRequest`); responde `202` con el `analysisId` |
| `GET /v1/analyses/:id` | Estado y reporte (`Report`) |
| `GET /v1/analyses/:id/markdown` | El mismo reporte en Markdown |

MVP: verificación de key con caché corta, límites del plan (402) y de tasa (429), discovery + breaker hacia web y reports, propagación de `x-request-id` y `x-gyde-tenant-id`. Detalle: [`services/gateway/README.md`](../../services/gateway/README.md).

## registry

Mantiene las instancias activas y saludables de cada servicio. Registro, *heartbeat* y baja; el **Health Checker** consulta `/healthz` y elimina instancias que dejan de responder. Solo red interna. Detalle: [`services/registry/README.md`](../../services/registry/README.md).

## web

App Next.js (UI + rutas de servidor). Módulos: `auth` (GitHub OAuth), `billing` (Stripe Checkout, Portal y webhooks → `Entitlements`), `api-keys` (hasheadas; se muestran una sola vez) y `llm-config` (llave BYOK cifrada). Endpoints internos: verificación de API key (para el gateway) y configuración LLM del tenant (para llm-analysis). Detalle: [`services/web/README.md`](../../services/web/README.md).

## normalization

Ingiere fuentes heterogéneas en tres niveles de confianza (`structured`, `official`, `community`) y las convierte en `KnowledgeObject`. Expone `POST /internal/knowledge/query` (candidatos por ecosistema y nombre; el cruce de versiones lo hace retrieval). Cadencias distintas por nivel. Detalle: [`services/normalization/README.md`](../../services/normalization/README.md).

## retrieval

Tres vías, dos de ellas determinísticas: **vulnerabilidades** (dependencia + versión contra rangos afectados), **licencias** (compatibilidad SPDX) y **compatibilidad** (motor + SDK + plataforma). Publica el resultado determinístico a reports y, si el plan lo permite, reenvía la evidencia a llm-analysis. Detalle: [`services/retrieval/README.md`](../../services/retrieval/README.md).

## llm-analysis

Obtiene la llave LLM del tenant desde web, llama al proveedor detrás de un Circuit Breaker **por tenant + proveedor**, valida la respuesta con el esquema y la publica en reports; ante fallo publica el motivo (`llm-not-configured`, `llm-unavailable`, `llm-error`). Detalle: [`services/llm-analysis/README.md`](../../services/llm-analysis/README.md).

## reports

Orquesta el análisis (crea el trabajo, pide evidencia a retrieval, recibe los resultados) y compone el reporte con el patrón **Decorator** según los `Entitlements`. Un reporte nunca queda colgado: si la IA no responde a tiempo pasa a `ready` y degradado. Detalle: [`services/reports/README.md`](../../services/reports/README.md).

## Clientes (entorno del usuario)

| App | Papel |
|---|---|
| `apps/cli` | `gyde analyze`: `LocalCLIPipeline` sobre `@gyde/analysis-engine` |
| `apps/github-action` | `GitHubActionPipeline`: lee el runner y comenta en el PR |
| `apps/vscode-extension` | Comando de VS Code sobre el mismo motor (esqueleto en el MVP) |

Los tres solo conocen la URL del gateway.

## Qué está dibujado y qué se añadió

| Elemento | Origen |
|---|---|
| Los 6 contenedores y sus relaciones principales | Diagrama de contenedores del documento |
| Service Registry y Health Checker | Descritos en el texto del patrón Service Discovery; contenedor de infraestructura añadido |
| `llm-analysis → web` (llave BYOK) | Añadida: el diagrama no mostraba cómo llega la configuración de LLM del Servicio Web al servicio de análisis |
