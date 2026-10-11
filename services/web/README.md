# web: Servicio Web

Cara visible de Gyde y su "caja registradora": **interfaz web**, **suscripciones con Stripe**, **API keys** y **llaves de LLM de cada estudio (BYOK)**. Es una aplicación **Next.js** (UI + rutas de servidor) que cuenta como **un solo contenedor** del diagrama.

> **Estado:** inicio de sesión con GitHub, tenant `free` al primer ingreso, API keys (pantalla, rutas y `POST /internal/api-keys/verify`) y `/healthz` listos. Stripe y BYOK pendientes; las pantallas de facturación y llave de IA siguen siendo maquetas.

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
| `src/ui` | Componentes base (`Button`, `Input`, `Card`, `Table`, `Dialog`, `CopyField`) con CSS Modules que solo usan tokens `var(--gyde-…)` |
| `src/lib/auth` | Configuración de Auth.js (NextAuth v5) |
| `src/lib/db` | Cliente Drizzle ORM + schema |
| `src/lib/fonts.ts` | Configuración de fuentes con `next/font` |
| `src/middleware.ts` | Protección de rutas autenticadas |

Las reglas de capas aplican dentro de cada módulo (`domain` no importa Next, Stripe ni la base de datos): ESLint las comprueba.

## Estilos

Sin Tailwind: cada componente y pantalla usa **CSS Modules** (`*.module.css`) con los tokens de `@gyde/design-tokens` (`var(--gyde-color-…)`, `--gyde-space-…`, `--gyde-radius-…`). Nada de colores ni medidas sueltas. Los componentes de `src/ui` traen su propio anillo de foco (`outline` de 2 px + `--gyde-shadow-focus`) y áreas táctiles de 44 px; por debajo de 640 px las tablas se apilan como tarjetas para no generar scroll horizontal. Las páginas de facturación, llave de IA, panel y la landing todavía usan clases de Tailwind que no tienen efecto; se migran en sus PR.

## Pantalla de API keys (`/dashboard/api-keys`)

- Crear (entorno `test`/`live` y nombre opcional), listar (prefijo y últimos 4, estado, creada, último uso) y revocar con confirmación. Usa `GET`/`POST /api/api-keys` y `POST /api/api-keys/:id/revoke`.
- Las rutas responden con `ApiKeyView` (`modules/api-keys/application/api-key-view.ts`), construida campo por campo: el hash nunca sale del servidor.
- La clave en claro solo llega en la respuesta de creación; vive en el estado del diálogo y se descarta al cerrarlo. No hay forma de volver a pedirla.

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

## Scripts

```bash
pnpm --filter @gyde/web dev          # Desarrollo (puerto 3000)
pnpm --filter @gyde/web build        # Build producción (standalone)
pnpm --filter @gyde/web start        # Ejecutar build de producción
pnpm --filter @gyde/web typecheck    # Verificar tipos TypeScript
pnpm --filter @gyde/web lint         # ESLint
pnpm --filter @gyde/web test         # Vitest
pnpm --filter @gyde/web db:generate  # Generar migraciones Drizzle
pnpm --filter @gyde/web db:push      # Push schema a DB
pnpm --filter @gyde/web db:migrate   # Ejecutar migraciones
pnpm --filter @gyde/web db:studio    # Drizzle Studio
```

## Pruebas

```bash
pnpm --filter @gyde/web test
```

Las pruebas cubren:
- Bootstrap: scripts, config Next.js, fonts, tokens CSS
- Base de datos: schema Drizzle con todas las tablas requeridas
- Design tokens: integración correcta de variables semánticas
- API keys: security tests con repositorios falsos (sin BD), aislamiento entre tenants, 401/403

## Migraciones

- Se generan con `pnpm --filter @gyde/web db:generate` (usa drizzle-kit).
- drizzle-kit pone el prefijo `"public".` en las claves foráneas (p.ej. `REFERENCES "public"."users"`).
  **Hay que quitar ese prefijo manualmente** del SQL generado en `drizzle/*.sql` antes de commitearlo,
  porque el rol `web` usa `search_path = web` y no tiene acceso a `public`.
- Se aplican **al arrancar el servicio**, antes de escuchar peticiones, usando un ejecutor propio
  (`src/infrastructure/db/migrate.ts`) que:
  - Aplica las migraciones bajo un candado consultivo (varias instancias a la vez no se pisan).
  - Verifica integridad: se niega a arrancar si una migración ya aplicada fue editada (crea una nueva en su lugar).
  - No usa el migrador de Drizzle porque este ejecuta `CREATE SCHEMA IF NOT EXISTS`, que el rol `web` no puede (no tiene `CREATE` sobre la base, por diseño).
- En pruebas se usa PGlite (PostgreSQL en memoria, sin Docker ni red) con las mismas migraciones.

## Configuración

Ver `.env.example` (raíz del repo): `WEB_PORT`, `WEB_DATABASE_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_*`, `LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`, `INTERNAL_SERVICE_TOKEN`.

## Docker

```bash
# Desarrollo con live reload
docker compose -f infra/compose/compose.yaml watch

# Build de producción
docker build -f services/web/Dockerfile -t gyde-web .
```

## Pruebas

```bash
pnpm --filter @gyde/web test
```

Las pruebas cubren:
- Bootstrap: scripts, config Next.js, fonts, tokens CSS
- Base de datos: schema Drizzle con todas las tablas requeridas
- Design tokens: integración correcta de variables semánticas
- API keys: security tests con repositorios falsos (sin BD), aislamiento entre tenants, 401/403

## Migraciones

- Se generan con `pnpm --filter @gyde/web db:generate` (usa drizzle-kit).
- drizzle-kit pone el prefijo `"public".` en las claves foráneas (p.ej. `REFERENCES "public"."users"`).
  **Hay que quitar ese prefijo manualmente** del SQL generado en `drizzle/*.sql` antes de commitearlo,
  porque el rol `web` usa `search_path = web` y no tiene acceso a `public`.
- Se aplican **al arrancar el servicio**, antes de escuchar peticiones, usando un ejecutor propio
  (`src/infrastructure/db/migrate.ts`) que:
  - Aplica las migraciones bajo un candado consultivo (varias instancias a la vez no se pisan).
  - Verifica integridad: se niega a arrancar si una migración ya aplicada fue editada (crea una nueva en su lugar).
  - No usa el migrador de Drizzle porque este ejecuta `CREATE SCHEMA IF NOT EXISTS`, que el rol `web` no puede (no tiene `CREATE` sobre la base, por diseño).
- En pruebas se usa PGlite (PostgreSQL en memoria, sin Docker ni red) con las mismas migraciones.

## Configuración

Ver `.env.example` (raíz del repo): `WEB_PORT`, `WEB_DATABASE_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_*`, `LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`, `INTERNAL_SERVICE_TOKEN`.

## Docker

```bash
# Desarrollo con live reload
docker compose -f infra/compose/compose.yaml watch

# Build de producción
docker build -f services/web/Dockerfile -t gyde-web .
```