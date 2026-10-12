# web: Servicio Web

Cara visible de Gyde y su "caja registradora": **interfaz web**, **suscripciones con Stripe**, **API keys** y **llaves de LLM de cada estudio (BYOK)**. Es una aplicación **Next.js** (UI + rutas de servidor) que cuenta como **un solo contenedor** del diagrama.

> **Estado:** carpeta estructurada, **sin código**. Lo primero que hace el **Área 2** es crear la app de Next.js aquí (`docs/tasks/area-2-web-pagos-y-superficies.md`).

- Puerto: `WEB_PORT` (3000).
- Datos propios: schema `web` de PostgreSQL (usuarios, suscripciones, API keys, configuración LLM cifrada).
- Origen en el documento: contenedor *Servicio Web* ("Pagos y config. de LLMs"). Stripe le notifica eventos por **webhook** y él crea cargos/consultas.

## Módulos (vertical slices, cada uno con su `domain/`, `application/`, `infrastructure/`)

| Módulo | Responsabilidad |
|---|---|
| `src/modules/auth` | Inicio de sesión con GitHub (OAuth), cuentas y *tenants* |
| `src/modules/billing` | Stripe Checkout, Portal de cliente, webhooks → estado de la suscripción → `Entitlements` |
| `src/modules/api-keys` | Emitir, listar, revocar y **verificar** API keys (se guardan **hasheadas**, la clave se muestra una sola vez) |
| `src/modules/llm-config` | Alta, prueba de conexión y rotación de la llave LLM del estudio; **cifrada en reposo** |
| `src/app` | Rutas y páginas de Next.js: **delgadas**, llaman casos de uso de los módulos |
| `src/ui` | Componentes de interfaz sobre `@gyde/design-tokens` |

Las reglas de capas aplican dentro de cada módulo (`domain` no importa Next, Stripe ni la base de datos): ESLint las comprueba.

## Endpoints internos (solo servicio a servicio, con `x-internal-token`)

| Ruta | Quién llama | Contrato |
|---|---|---|
| `POST /internal/api-keys/verify` | Gateway | `VerifyApiKeyRequest` → `VerifyApiKeyResponse` (tenant + `Entitlements`) |
| `GET /internal/tenants/:tenantId/llm-config` | llm-analysis | → `InternalLlmConfig` (**con la llave descifrada**) |

Y el webhook público de Stripe (firma verificada con `STRIPE_WEBHOOK_SECRET`).

## Seguridad de la llave LLM (BYOK)

- Cifrado **AES-256-GCM** con una clave maestra por `kid` (`LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`) para poder **rotar**.
- La llave en claro **nunca** se devuelve a la UI (solo `keyLast4`), **nunca** se registra en logs y solo sale por el endpoint interno hacia llm-analysis.
- El endpoint interno no se expone por el gateway y exige el token interno.
- "Probar conexión" valida la llave contra el proveedor antes de guardarla.

## Planes y límites

Los planes (Free / Pro / Studio) son **datos**: `PLAN_CATALOG` en `@gyde/contracts`. Al cambiar la suscripción, el webhook recalcula los `Entitlements` del tenant; el resto del sistema solo lee permisos, no nombres de plan. Usa **llaves de modo test** de Stripe en desarrollo.

## Diseño

Interfaz limpia, verde y blanco, con Bricolage Grotesque + Figtree. Todo viene de `@gyde/design-tokens` (variables CSS `--gyde-*`) y de `docs/design/sistema-de-diseno.md`. Respeta el contraste mínimo WCAG AA.

## Configuración

Ver `.env.example`: `WEB_PORT`, `WEB_DATABASE_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_*`, `LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`, `INTERNAL_SERVICE_TOKEN`.
