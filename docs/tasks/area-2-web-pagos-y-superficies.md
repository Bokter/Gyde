# Área 2: Web, Pagos y Superficies de usuario

> **Responsable:** _(asignar)_ · Lee primero el [plan del equipo](00-resumen.md).

## Objetivo

Construir el **Servicio Web** (Next.js): inicio de sesión, **suscripciones con Stripe**, **API keys** y la **llave de IA de cada estudio (BYOK)**, con los dos endpoints internos que otros servicios necesitan. Además, las superficies que corren en el entorno del cliente: la **GitHub Action** y (si alcanza) la **extensión de VS Code**. Eres dueña o dueño del diseño: [`sistema-de-diseno.md`](../design/sistema-de-diseno.md) y `@gyde/design-tokens`.

Tienes el módulo más delicado en seguridad: custodias **llaves de terceros**. Léete antes [Datos, privacidad y seguridad](../architecture/04-datos-privacidad-seguridad.md) y el [ADR 0007](../adr/0007-llaves-llm-por-estudio-byok.md).

## Lecturas obligatorias

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) · [Visión general](../architecture/00-vision-general.md) · [Flujos](../architecture/02-flujos.md) (5 y 6) · [Datos, privacidad y seguridad](../architecture/04-datos-privacidad-seguridad.md) · [ADR 0007](../adr/0007-llaves-llm-por-estudio-byok.md) · [Sistema de diseño](../design/sistema-de-diseno.md) · README de `services/web`, `packages/design-tokens`, `apps/github-action`, `apps/vscode-extension` y `packages/contracts`.

## Qué construyes y cómo está hoy

| Módulo | Estado hoy | Tu trabajo |
|---|---|---|
| `services/web` | Solo carpetas por módulo y README | Crear la app Next.js e implementar todo |
| `packages/design-tokens` | Hecho y probado | Usarlo; extenderlo si hace falta |
| `apps/github-action` | `action.yml` y stub | Implementar (apoyada en el motor del Área 4) |
| `apps/vscode-extension` | Manifiesto y stub | Comando y panel (primero en recortarse) |

## Archivos

**Sí tocas:** `services/web/**` · `apps/github-action/**` · `apps/vscode-extension/**` · `packages/design-tokens/**` · `docs/design/**` · la línea de `web` en `infra/compose/compose.yaml` y un `services/web/Dockerfile` (coordina con el Área 1).

**No tocas:** el resto de servicios, `packages/analysis-engine`, `resilience`, `discovery`. Para `packages/contracts` abre un PR pequeño y pide revisión a otra área. Para añadir Next a ESLint, edita `eslint.config.mjs` con un cambio mínimo y avisa.

## Contratos

`VerifyApiKeyRequest` / `VerifyApiKeyResponse`, `Entitlements`, `PLAN_CATALOG`, `Plan`, `LlmProviderConfigInput`, `LlmProviderConfigView`, `InternalLlmConfig`, `ROUTES.web.*`, `HEADERS`, `ApiError`.

## Entregables y criterios de aceptación

### 0. Arranque de la app (día 1)

- [ ] App **Next.js** (App Router, TypeScript) en `services/web` con scripts `dev`, `build`, `start`, `typecheck`, `lint`, `test`; puerto 3000; `output: 'standalone'` para la imagen.
- [ ] Fuentes con `next/font`: **Bricolage Grotesque**, **Figtree** y **JetBrains Mono**; estilos con `@gyde/design-tokens/css`.
- [ ] `pnpm lint`, `typecheck` y `test` del monorepo siguen en verde; respeta las reglas de capas dentro de `src/modules/*`.
- [ ] Base de datos: schema `web` (`WEB_DATABASE_URL`) con migraciones (Drizzle recomendado). Tablas sugeridas: `users`, `tenants`, `subscriptions`, `api_keys`, `llm_configs`, `stripe_events`.
- [ ] Descomentar `web` en `infra/compose/compose.yaml` y crear su `Dockerfile` (coordina con el Área 1).

### 1. Autenticación

- [ ] Inicio de sesión con **GitHub (OAuth)** (Auth.js o Better Auth), sesión segura y rutas protegidas.
- [ ] Al primer ingreso se crea un **tenant** con plan `free`.

### 2. Suscripciones con Stripe (modo test)

- [ ] **Stripe Checkout** para Pro y Studio (precios por `STRIPE_PRICE_PRO` / `STRIPE_PRICE_STUDIO`) y **Portal de cliente**.
- [ ] **Webhook** con verificación de firma (`STRIPE_WEBHOOK_SECRET`) y **procesamiento idempotente** (tabla `stripe_events`): `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`.
- [ ] El estado de la suscripción se traduce a un plan y a sus `Entitlements` (de `PLAN_CATALOG`). Cancelar vuelve a `free`. **El webhook es la única fuente de verdad**: volver de Checkout no cambia el plan por sí solo.
- [ ] Pruebas con eventos de ejemplo de Stripe, **sin red**. Solo llaves de modo test.

### 3. API keys

- [ ] Se generan con prefijo (`gyde_live_` / `gyde_test_`) y 32 bytes aleatorios; se guarda **solo el hash** (más prefijo, últimos 4, fechas); la clave en claro se muestra **una vez**.
- [ ] Listar (prefijo y últimos 4) y **revocar**.
- [ ] `POST /internal/api-keys/verify` (con `x-internal-token`, usa `protectInternalRoutes`-equivalente en Next) devuelve `VerifyApiKeyResponse` con `tenantId`, `apiKeyId` y `Entitlements`, o `valid: false` con motivo. Búsqueda por hash, comparación en tiempo constante. **Entrégalo el día 2** (el Área 1 lo necesita).

### 4. Llave de IA del estudio (BYOK)

- [ ] Formulario: proveedor, modelo y llave (**solo escritura**). **Probar conexión** contra el proveedor antes de guardar (detrás de una interfaz; con un proveedor falso en pruebas).
- [ ] Se guarda **cifrada con AES-256-GCM** usando `LLM_KEY_ENCRYPTION_KEYS` / `LLM_KEY_ACTIVE_KID` (clave maestra versionada por `kid`; descifrar con el `kid` guardado permite rotar).
- [ ] La UI solo muestra proveedor, modelo y **últimos 4** (`LlmProviderConfigView`); revocar y reemplazar.
- [ ] `GET /internal/tenants/:tenantId/llm-config` (con token interno) devuelve `InternalLlmConfig` con la llave descifrada, o `404` si no hay. **Entrégalo el día 3** (lo necesita el Área 4).
- [ ] **Pruebas de seguridad:** la llave nunca aparece en logs, en respuestas de la UI ni en mensajes de error; el endpoint interno rechaza sin token; el texto cifrado cambia entre dos cifrados de la misma llave.

### 5. Interfaz

- [ ] Pantallas del [sistema de diseño §8](../design/sistema-de-diseno.md): inicio y precios, iniciar sesión, panel, API keys, facturación, llave de IA.
- [ ] Componentes del §7 sobre primitivos accesibles, tematizados con los tokens semánticos (`var(--gyde-color-…)`). Contraste AA, foco visible, teclado completo, sin scroll horizontal en 375 px.
- [ ] Textos en español, tono del §9.

### 6. GitHub Action (días 3 y 4)

- [ ] Implementar `apps/github-action/src/main.ts` según su README: entradas de `action.yml`, `GitHubActionPipeline` + `GydeApiClient`, **un único comentario** de PR (se actualiza, no se duplica), falla según `fail-on`, `core.setSecret` para la key.
- [ ] Empaquetada en `dist/index.js` sin `node_modules` (`pnpm --filter @gyde/github-action build`).
- [ ] Mientras el motor no esté listo, usa un `AnalysisGateway` falso.

### 7. Extensión de VS Code (opcional)

- [ ] Comando `Gyde: Analyze project`, API key en `context.secrets`, resultado en un panel o canal de salida.

## Dependencias con otras áreas

| Necesitas | De | Mientras tanto |
|---|---|---|
| `GydeApiClient` y pipeline para la Action | Área 4 | `AnalysisGateway` falso con `@gyde/contracts/samples` |
| Nada más es bloqueante: Web es dueña de sus datos |  |  |

| Entregas | A quién | Cuándo |
|---|---|---|
| `POST /internal/api-keys/verify` | Área 1 (gateway) | **Día 2** |
| `GET /internal/tenants/:id/llm-config` | Área 4 (llm-analysis) | **Día 3** |

## Orden sugerido

1. **Día 1:** app Next.js + tokens + fuentes + base de datos + autenticación.
2. **Día 2:** API keys y su endpoint de verificación → inicio de Stripe Checkout.
3. **Día 3:** webhook y entitlements → BYOK y su endpoint interno.
4. **Día 4:** integración E2E; la Action; pulir la interfaz.
5. **Día 5:** pruebas de seguridad, diseño final, documentación.

## Si hay retraso

Sin visor de reportes · sin extensión de VS Code · prueba de conexión mínima (un solo proveedor) · sin rotación de claves maestras (solo `kid` único) · una sola moneda y sin impuestos en Stripe.

## Prompt para tu asistente

El prompt completo (contexto, arquitectura, patrones, reglas de coherencia entre documentos y código, flujo con `dev` y los detalles de esta área) está en [`prompts/prompt-area-2-web-pagos-y-superficies.md`](prompts/prompt-area-2-web-pagos-y-superficies.md). Pégalo al empezar tu sesión con Claude.
