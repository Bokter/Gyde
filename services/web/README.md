# web: Servicio Web

Cara visible de Gyde y su "caja registradora": **interfaz web**, **suscripciones con Stripe**, **API keys** y **llaves de LLM de cada estudio (BYOK)**. Es una aplicación **Next.js** (UI + rutas de servidor) que cuenta como **un solo contenedor** del diagrama.

> **Estado:** inicio de sesión con GitHub, tenant `free` al primer ingreso, API keys (pantalla, rutas y `POST /internal/api-keys/verify`), `/healthz` y el backend de la llave de IA (BYOK: rutas `/api/llm-config` y `GET /internal/tenants/:tenantId/llm-config`) listos. Pendientes: la pantalla de la llave de IA y Stripe; la pantalla de facturación sigue siendo una maqueta.

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
| `src/modules/dev-seed` | `seed:dev`: tenant `free` y API key de test para desarrollo local |
| `src/app` | Rutas y páginas de Next.js: **delgadas**, llaman casos de uso de los módulos |
| `src/ui` | Componentes base (`Button`, `Input`, `Select`, `Card`, `Table`, `Dialog`, `CopyField`) con CSS Modules que solo usan tokens `var(--gyde-…)` |
| `src/lib/auth` | Configuración de Auth.js (NextAuth v5) |
| `src/lib/db` | Cliente Drizzle ORM + schema |
| `src/lib/fonts.ts` | Configuración de fuentes con `next/font` |
| `src/middleware.ts` | Protección de rutas autenticadas |

Las reglas de capas aplican dentro de cada módulo (`domain` no importa Next, Stripe ni la base de datos): ESLint las comprueba.

## Estilos

Sin Tailwind: cada componente y pantalla usa **CSS Modules** (`*.module.css`) con los tokens de `@gyde/design-tokens` (`var(--gyde-color-…)`, `--gyde-space-…`, `--gyde-radius-…`). Nada de colores ni medidas sueltas. Los componentes de `src/ui` traen su propio anillo de foco (`outline` de 2 px + `--gyde-shadow-focus`) y áreas táctiles de 44 px; por debajo de 640 px las tablas se apilan como tarjetas para no generar scroll horizontal. Las páginas de facturación, panel y la landing todavía usan clases de Tailwind que no tienen efecto; se migran en sus PR.

## Pantalla de API keys (`/dashboard/api-keys`)

- Crear (entorno `test`/`live` y nombre opcional), listar (prefijo y últimos 4, estado, creada, último uso) y revocar con confirmación. Usa `GET`/`POST /api/api-keys` y `POST /api/api-keys/:id/revoke`.
- Las rutas responden con `ApiKeyView` (`modules/api-keys/application/api-key-view.ts`), construida campo por campo: el hash nunca sale del servidor.
- La clave en claro solo llega en la respuesta de creación; vive en el estado del diálogo y se descarta al cerrarlo. No hay forma de volver a pedirla.

## Pantalla de llave de IA (`/dashboard/llm-config`)

- Solo **Anthropic** (lo único que usa `llm-analysis`). Modelos ofrecidos en `modules/llm-config/application/llm-model-options.ts`: `claude-opus-5-5` (por defecto), `claude-sonnet-5-5` y `claude-haiku-5-5`.
- Muestra proveedor, modelo, `••••` + últimos 4, estado y fecha; permite guardar, reemplazar (prueba la conexión antes) y revocar con confirmación. Usa `GET`/`PUT`/`DELETE /api/llm-config`.
- La llave solo está en el estado del formulario mientras se escribe: al enviar sale del estado antes de la petición (`llm-key-form.ts`) y nunca vuelve del servidor. Los errores se escriben a partir del código y la razón conocida (`invalid-key`, `model-not-found`, `unreachable`), nunca con texto del servidor.
- Avisa que la IA solo se usa en Pro y Studio: en Free la llave se puede guardar, pero los análisis no la usan.

## Endpoints internos (solo servicio a servicio, con `x-internal-token`)

| Ruta | Quién llama | Contrato |
|---|---|---|
| `POST /internal/api-keys/verify` | Gateway | `VerifyApiKeyRequest` → `VerifyApiKeyResponse` (tenant + `Entitlements`) |
| `GET /internal/tenants/:tenantId/llm-config` | llm-analysis | → `InternalLlmConfig` (**con la llave descifrada**), `404` si el estudio no tiene llave, `401` sin token |

Y el webhook público de Stripe (firma verificada con `STRIPE_WEBHOOK_SECRET`).

Todas pasan por `src/lib/internal-auth.ts` (`rejectUnlessInternal`): compara `x-internal-token` en tiempo constante (sobre digests SHA-256, así tampoco filtra la longitud) y rechaza todo si falta `INTERNAL_SERVICE_TOKEN`. Los logs salen de `src/lib/logger.ts` (pino con los mismos campos censurados que `@gyde/service-kit`, más `plainKey` y `encryptedKey`); no se usa `console.*`.

## Seguridad de la llave LLM (BYOK)

- Cifrado **AES-256-GCM** con una clave maestra por `kid` (`LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`) para poder **rotar**.
- La llave en claro **nunca** se devuelve a la UI (solo `keyLast4`), **nunca** se registra en logs y solo sale por el endpoint interno hacia llm-analysis.
- El endpoint interno no se expone por el gateway y exige el token interno.
- "Probar conexión" valida la llave contra el proveedor antes de guardarla.

Cómo está implementado (`src/modules/llm-config`):

| Pieza | Detalle |
|---|---|
| Proveedores | Solo `anthropic`, el único que `llm-analysis` sabe usar. Otro proveedor responde `400 unsupported-provider` sin probar nada |
| Prueba de conexión | Puerto `LlmConnectionTester`. `LLM_CONNECTION_TESTER=anthropic` llama `GET /v1/models/{model}` con el SDK oficial (no gasta tokens; valida llave y modelo). `offline` solo revisa la forma (`sk-ant-…`, modelo `claude-…`) y no usa la red: para demos sin conexión. Fallo → `422 connection-test-failed` con `reason` (`invalid-key`, `model-not-found`, `unreachable`) |
| Cifrado | AES-256-GCM, IV aleatorio de 12 bytes por cifrado; se guardan `kid`, `iv`, `auth_tag` y `encrypted_key` en `llm_configs`. El `tenantId` va como dato autenticado (AAD): un texto cifrado copiado a la fila de otro tenant no descifra |
| Rotación | Agrega `k2:<base64>` a `LLM_KEY_ENCRYPTION_KEYS` y pon `LLM_KEY_ACTIVE_KID=k2`. Lo nuevo se cifra con `k2`; lo existente se sigue descifrando con el `kid` guardado. Retira `k1` solo cuando ninguna fila lo use (`select kid, count(*) from llm_configs group by kid`) |
| Reemplazar | Guardar otra vez: nueva prueba, nuevo IV, `kid` activo y `rotated_at` |
| Revocar | Borra la fila (el texto cifrado desaparece); desde ese momento el endpoint interno responde `404` y llm-analysis publica `llm-not-configured` |
| Arranque | Una llave maestra mal formada o un `LLM_KEY_ACTIVE_KID` inexistente hace fallar la petición con un error claro; los mensajes nombran el `kid`, nunca material de llave |

Rutas del panel (con sesión): `GET /api/llm-config` → `{ config: LlmProviderConfigView | null }`, `PUT /api/llm-config` (`LlmProviderConfigInput`) → `{ config }`, `DELETE /api/llm-config` → `{ revoked: true }` o `404`. Los errores de validación devuelven solo `path` y `code`, nunca el valor recibido.

En producción la llave maestra viene de un gestor de secretos (AWS Secrets Manager, GCP Secret Manager, Vault…) y se inyecta como variable solo al contenedor de web; perderla deja ilegibles todas las llaves guardadas. En desarrollo la genera `infra/scripts/bootstrap-env.mjs`.

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
pnpm --filter web seed:dev           # Tenant free + API key de test (solo desarrollo)
```

### Datos de desarrollo (`seed:dev`)

Crea el usuario `dev-seed`, el tenant `gyde-dev-seed` con plan `free` y una API key `gyde_test_…`,
todo en una sola transacción, e imprime la clave **una sola vez** por stdout (los demás mensajes van
a stderr y nunca la incluyen). Se guarda solo su hash.

```bash
# Con el Postgres de compose: el host ve la base en localhost:$POSTGRES_PORT, no en postgres:5432.
pnpm --filter web migrate   # si la base está vacía
WEB_DATABASE_URL=postgres://web:<contraseña>@localhost:<POSTGRES_PORT>/gyde pnpm --filter web seed:dev
```

- **Idempotente:** si `gyde-dev-seed` ya existe, no crea nada ni lo modifica y avisa de que la clave no
  se puede volver a mostrar. El usuario `dev-seed` no puede iniciar sesión (no es una cuenta de
  GitHub), así que para otra clave hay que borrar el tenant (`delete from web.tenants where slug =
  'gyde-dev-seed'`, que borra sus keys en cascada) y volver a ejecutarlo.
- **Se niega con `NODE_ENV=production`** (sale con código 1 sin abrir la base). No forma parte de la
  imagen Docker.

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

Ver `.env.example` (raíz del repo): `WEB_PORT`, `WEB_DATABASE_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_*`, `LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`, `LLM_CONNECTION_TESTER`, `INTERNAL_SERVICE_TOKEN`.

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

Ver `.env.example` (raíz del repo): `WEB_PORT`, `WEB_DATABASE_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_*`, `LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`, `LLM_CONNECTION_TESTER`, `INTERNAL_SERVICE_TOKEN`.

## Docker

```bash
# Desarrollo con live reload
docker compose -f infra/compose/compose.yaml watch

# Build de producción
docker build -f services/web/Dockerfile -t gyde-web .
```