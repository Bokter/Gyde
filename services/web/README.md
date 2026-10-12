# web: Servicio Web

Cara visible de Gyde y su "caja registradora": **interfaz web**, **suscripciones con Stripe**, **API keys** y **llaves de LLM de cada estudio (BYOK)**. Es una aplicación **Next.js** (UI + rutas de servidor) que cuenta como **un solo contenedor** del diagrama.

> **Estado:** inicio de sesión con GitHub, tenant `free` al primer ingreso, API keys (pantalla, rutas y `POST /internal/api-keys/verify`), llave de IA (pantalla, rutas `/api/llm-config` y `GET /internal/tenants/:tenantId/llm-config`), facturación con Stripe (Checkout, Portal de cliente, webhook `POST /api/stripe/webhook` y pantalla `/dashboard/billing`) y `/healthz` listos.

- Puerto: `WEB_PORT` (3000).
- Datos propios: schema `web` de PostgreSQL (usuarios, sesiones, suscripciones, API keys, configuración LLM cifrada).
- Origen en el documento: contenedor *Servicio Web* ("Pagos y config. de LLMs"). Stripe le notifica eventos por **webhook** y él crea cargos/consultas.

## Cómo ejecutarlo

Todos los comandos se lanzan desde la raíz del repo, con una ruta corta y fuera de OneDrive (ver [`infra/README.md`](../../infra/README.md)).

### Con Docker Compose

```bash
# Una sola vez: crea .env con secretos locales aleatorios
docker run --rm -v "$PWD":/work -w /work node:24-alpine node infra/scripts/bootstrap-env.mjs

# Atajo por terminal (el mismo que usa docs/workflow/dia-de-integracion.md)
C="docker compose -p gyde --env-file .env -f infra/compose/compose.yaml"

$C up --build web      # Postgres + web en http://localhost:3000
$C logs -f web
$C down                # para; añade -v para borrar también la base
```

- `-p gyde` fija el nombre del proyecto (contenedores, red y volumen). Sin él, compose usa el nombre del directorio y dos copias del repo se pisan.
- **`--env-file .env` es obligatorio.** El archivo de compose vive en `infra/compose`, y sin esa opción las variables del `.env` de la raíz no llegan a sus `${...}`.
- El servicio `web` arranca con `pnpm --filter @gyde/web dev`, que compila los tokens, **aplica las migraciones** y levanta `next dev`. Solo depende de Postgres.

### En tu máquina (sin Docker para web)

```bash
pnpm install
# El .env guarda WEB_DATABASE_URL con el host `postgres` (válido dentro de compose).
# Desde tu máquina la base se ve en localhost:$POSTGRES_PORT:
$C up -d postgres
export WEB_DATABASE_URL=postgres://web:<contraseña>@localhost:<POSTGRES_PORT>/gyde
pnpm --filter @gyde/web dev          # tokens + migraciones + next dev (puerto 3000)
```

### Migraciones

- Se generan con `pnpm --filter @gyde/web db:generate` (drizzle-kit).
- drizzle-kit pone el prefijo `"public".` en las claves foráneas (p. ej. `REFERENCES "public"."users"`). **Hay que quitarlo a mano** del SQL generado en `drizzle/*.sql` antes de commitear: el rol `web` usa `search_path = web` y no tiene acceso a `public`.
- Se aplican **al arrancar**, con `pnpm --filter @gyde/web migrate` (también lo hace `dev`), usando un ejecutor propio (`src/infrastructure/db/migrate.ts`) que:
  - toma un candado consultivo (varias instancias a la vez no se pisan);
  - verifica integridad: se niega a arrancar si una migración ya aplicada fue editada (crea una nueva en su lugar);
  - no usa el migrador de Drizzle porque este ejecuta `CREATE SCHEMA IF NOT EXISTS`, que el rol `web` no puede (no tiene `CREATE` sobre la base, por diseño).
- En pruebas se usa PGlite (PostgreSQL en memoria, sin Docker ni red) con las mismas migraciones.

### Datos de desarrollo (`seed:dev`)

Crea el usuario `dev-seed`, el tenant `gyde-dev-seed` con plan `free` y una API key `gyde_test_…`, todo en una sola transacción, e imprime la clave **una sola vez** por stdout (los demás mensajes van a stderr y nunca la incluyen). Se guarda solo su hash.

```bash
pnpm --filter @gyde/web migrate     # si la base está vacía
WEB_DATABASE_URL=postgres://web:<contraseña>@localhost:<POSTGRES_PORT>/gyde pnpm --filter @gyde/web seed:dev
```

- **Idempotente:** si `gyde-dev-seed` ya existe, no crea ni modifica nada y avisa de que la clave no se puede volver a mostrar. Para otra clave hay que borrar el tenant (`delete from web.tenants where slug = 'gyde-dev-seed'`, que borra sus keys en cascada) y repetir.
- El usuario `dev-seed` **no puede iniciar sesión** (no es una cuenta de GitHub): es para probar la API key con el CLI o el gateway, no la interfaz.
- **Se niega con `NODE_ENV=production`** (sale con código 1 sin abrir la base) y no forma parte de la imagen Docker.

### Scripts

```bash
pnpm --filter @gyde/web dev          # tokens + migraciones + next dev
pnpm --filter @gyde/web build        # build de producción (standalone)
pnpm --filter @gyde/web start        # ejecuta el build
pnpm --filter @gyde/web typecheck
pnpm --filter @gyde/web lint
pnpm --filter @gyde/web test         # Vitest (PGlite, sin Docker)
pnpm --filter @gyde/web db:generate  # generar migración
pnpm --filter @gyde/web db:studio    # Drizzle Studio
```

Las variables de entorno están en [`.env.example`](../../.env.example): `WEB_PORT`, `WEB_DATABASE_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_*`, `LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`, `LLM_CONNECTION_TESTER`, `INTERNAL_SERVICE_TOKEN`.

## Probar el inicio de sesión (OAuth App local)

El login es solo con GitHub, así que hace falta tu propia OAuth App (no se comparten credenciales):

1. GitHub → *Settings → Developer settings → OAuth Apps → New OAuth App*.
2. *Homepage URL*: `http://localhost:3000`. *Authorization callback URL*: `http://localhost:3000/api/auth/callback/github`.
3. Genera un *client secret* y ponlo en el `.env` de la raíz:

   ```bash
   GITHUB_CLIENT_ID=<client id>
   GITHUB_CLIENT_SECRET=<client secret>
   ```

4. Reinicia web (`$C up -d --force-recreate web`: compose no relee el `.env` en caliente), abre `http://localhost:3000` y pulsa **Iniciar con GitHub**.
5. Al primer ingreso se crea el usuario, la cuenta y un tenant `free`; deberías aterrizar en `/dashboard`. Con otra cuenta de GitHub obtienes otro tenant, útil para comprobar el aislamiento entre estudios.

Si vuelve a `/auth/login` con un error, revisa que la *callback URL* coincide exactamente (puerto incluido) y que `AUTH_SECRET` no esté vacío. La sesión se guarda en la tabla `sessions` (cookie `authjs.session-token`): para cerrar una sesión a mano basta borrar su fila.

## Arquitectura: Clean Architecture por módulo

Cada módulo de `src/modules/*` es una *vertical slice* con las capas de [ADR-0002](../../docs/adr/0002-arquitectura-limpia-y-reglas-de-capas.md) y la dependencia apunta siempre hacia adentro:

| Capa | Contiene | Puede importar |
|---|---|---|
| `domain/` | Entidades y las interfaces de sus repositorios | Nada de fuera (ni Next, ni Drizzle, ni Stripe) |
| `application/` | Casos de uso (`CreateApiKey`, `SaveLlmConfig`…) y **puertos** (`application/ports/*`) | `domain` y sus propios puertos |
| `infrastructure/` | **Adaptadores**: repositorios Drizzle, cifrado AES-GCM, probadores de conexión, y el `composition-root` | Todo lo anterior y librerías |

`src/app` (rutas y páginas) es delgada: llama casos de uso ya construidos. `tooling/eslint/layer-boundaries.mjs` impone estas reglas con `no-restricted-imports`, y `pnpm lint` falla si una capa importa de otra a la que no debe.

**Ejemplo 1: `api-keys`** (`src/modules/api-keys`)

- `domain/repositories.ts` declara `ApiKeyRepository` (`findByKeyHash`, `create`, `revoke`…): solo la interfaz.
- `application/verify-api-key.ts` (`VerifyApiKey`) recibe esa interfaz por constructor y decide si la llave es válida, está revocada o caducó. No sabe que existe Postgres.
- `infrastructure/drizzle-api-key-repository.ts` implementa la interfaz con Drizzle.
- `infrastructure/composition-root.ts` es el único lugar donde se hace `new VerifyApiKey(new DrizzleApiKeyRepository(), …)`. Las pruebas (`verify-api-key.test.ts`) usan repositorios falsos y no necesitan base de datos.

**Ejemplo 2: `llm-config`** (`src/modules/llm-config`)

- `application/ports/llm-key-cipher.ts` y `application/ports/llm-connection-tester.ts` son **puertos**: lo que el caso de uso necesita, expresado sin tecnología.
- `application/save-llm-config.ts` (`SaveLlmConfig`) orquesta: valida el proveedor, prueba la conexión, cifra y guarda, solo con esos puertos.
- `infrastructure/aes-gcm-llm-key-cipher.ts` es el adaptador de cifrado; `anthropic-connection-tester.ts` y `offline-connection-tester.ts` son dos adaptadores del mismo puerto.
- `infrastructure/composition-root.ts` elige el adaptador según `LLM_CONNECTION_TESTER` y construye todo **en el primer uso**, no al importar: `next build` carga las rutas sin los secretos de ejecución, y una llave maestra ausente debe fallar la petición, no el build.

### Patrones que le tocan a web

| Patrón | Dónde | Para qué |
|---|---|---|
| **Puertos y adaptadores** | `application/ports/*` + adaptadores en `infrastructure/` | Cambiar cifrado, probador de conexión o base sin tocar los casos de uso |
| **Repositorio** | `domain/repositories.ts` + `drizzle-*-repository.ts` | El dominio no conoce Drizzle; las pruebas usan repositorios falsos |
| **Composition root** | `infrastructure/composition-root.ts` de cada módulo | Un solo punto donde se instancian los adaptadores y se inyectan |
| **Verificación por hash** | `generate-api-key.ts` + `verify-api-key.ts` | La clave nunca se guarda: se busca por su SHA-256 |
| **Fail closed** | `src/lib/internal-auth.ts` | Sin `INTERNAL_SERVICE_TOKEN` se rechaza toda llamada interna |

El razonamiento general de dónde viven los patrones está en [ADR-0006](../../docs/adr/0006-donde-viven-los-patrones-de-diseno.md).

## Decisiones de seguridad

| Decisión | Por qué |
|---|---|
| **AES-256-GCM** con **AAD = `tenantId`** para la llave LLM | Es cifrado autenticado; con el `tenantId` como dato autenticado, un texto cifrado copiado a la fila de otro tenant no descifra |
| **SHA-256** para las API keys (solo se guarda el hash) | Las claves son aleatorias de 32 bytes, así que no hace falta un hash lento y la búsqueda por hash es directa. La clave en claro se muestra una vez y no se puede recuperar |
| **Sesión en base de datos** (`session: { strategy: 'database' }`) | Una sesión se puede revocar borrando su fila; con JWT habría que esperar a que caduque. Caduca a los 30 días |
| **Solo proveedor `anthropic`** | Es el único que `llm-analysis` sabe usar. Otro proveedor responde `400 unsupported-provider` sin probar nada |
| **Endpoints internos con `x-internal-token` en tiempo constante** | `rejectUnlessInternal` compara sobre digests SHA-256 con `timingSafeEqual`, así no filtra el contenido ni la longitud del token |

Cómo está implementada la llave LLM (BYOK):

| Pieza | Detalle |
|---|---|
| Cifrado | IV aleatorio de 12 bytes por cifrado; se guardan `kid`, `iv`, `auth_tag` y `encrypted_key` en `llm_configs`. Una clave maestra por `kid` (`LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`) permite **rotar** |
| Rotación | Añade `k2:<base64>` a `LLM_KEY_ENCRYPTION_KEYS` y pon `LLM_KEY_ACTIVE_KID=k2`. Lo nuevo se cifra con `k2`; lo existente se sigue descifrando con el `kid` guardado. Retira `k1` solo cuando ninguna fila lo use (`select kid, count(*) from llm_configs group by kid`) |
| Prueba de conexión | `LLM_CONNECTION_TESTER=anthropic` llama `GET /v1/models/{model}` con el SDK oficial (no gasta tokens; valida llave y modelo). `offline` solo revisa la forma (`sk-ant-…`, modelo `claude-…`) y no usa la red: para demos sin conexión. Fallo → `422 connection-test-failed` con `reason` (`invalid-key`, `model-not-found`, `unreachable`) |
| Reemplazar | Guardar otra vez: nueva prueba, nuevo IV, `kid` activo y `rotated_at` |
| Revocar | Borra la fila; desde ese momento el endpoint interno responde `404` y llm-analysis publica `llm-not-configured` |
| Arranque | Una llave maestra mal formada o un `LLM_KEY_ACTIVE_KID` inexistente hace fallar la petición con un error claro; los mensajes nombran el `kid`, nunca material de llave |

La llave en claro **nunca** se devuelve a la UI (solo `keyLast4`), **nunca** se registra en logs y solo sale por el endpoint interno hacia llm-analysis, que no se expone por el gateway. En producción la llave maestra viene de un gestor de secretos y se inyecta solo al contenedor de web; perderla deja ilegibles todas las llaves guardadas. En desarrollo la genera `infra/scripts/bootstrap-env.mjs`.

Los logs salen de `src/lib/logger.ts` (pino con los mismos campos censurados que `@gyde/service-kit`, más `plainKey` y `encryptedKey`); no se usa `console.*`.

## Endpoints

Rutas del panel (con sesión):

| Ruta | Respuesta |
|---|---|
| `GET` / `POST /api/api-keys` | Lista (`ApiKeyView`, sin hash) / crea y devuelve la clave en claro una sola vez |
| `POST /api/api-keys/:id/revoke` | Revoca |
| `GET /api/llm-config` | `{ config: LlmProviderConfigView \| null }` |
| `PUT /api/llm-config` | Guarda o reemplaza (`LlmProviderConfigInput`) → `{ config }` |
| `DELETE /api/llm-config` | `{ revoked: true }` o `404` |
| `POST /api/billing/checkout` | Formulario con `plan` (`pro`/`studio`) → `303` a Stripe Checkout (o al Portal si el estudio ya paga) |
| `POST /api/billing/portal` | `303` al Portal de cliente de Stripe |

Los errores de validación devuelven solo `path` y `code`, nunca el valor recibido. Las dos rutas de facturación son formularios: exigen que el header `Origin` sea el de la propia web (`403` si no) y, ante un error, vuelven a `/dashboard/billing?error=…` sin mostrar el mensaje de Stripe.

Servicio a servicio (solo con `x-internal-token`, sin token `401`):

| Ruta | Quién llama | Contrato |
|---|---|---|
| `POST /internal/api-keys/verify` | Gateway | `VerifyApiKeyRequest` → `VerifyApiKeyResponse` (tenant + `Entitlements`) |
| `GET /internal/tenants/:tenantId/llm-config` | llm-analysis | → `InternalLlmConfig` (**con la llave descifrada**), `404` si el estudio no tiene llave |

Y el webhook público de Stripe, descrito abajo.

## Checkout y Portal de cliente

- **Puerto y adaptador**: `BillingGateway` (`application/ports/billing-gateway.ts`) crea las sesiones; `StripeBillingGateway` (`infrastructure/`) usa el SDK. Al construirse **rechaza cualquier `STRIPE_SECRET_KEY` que no empiece por `sk_test_`**.
- **Checkout** (`StartCheckout`): `mode: subscription` con `STRIPE_PRICE_PRO` o `STRIPE_PRICE_STUDIO`. Lleva el tenant en `client_reference_id` **y** en `subscription_data.metadata.tenantId`, porque Stripe puede entregar `customer.subscription.created` antes que `checkout.session.completed`. Reutiliza el `customer` del estudio si ya existe. Un estudio que ya paga va al Portal en vez de abrir una segunda suscripción.
- **Portal** (`OpenPortal`): solo si el estudio tiene `customer` en Stripe. Hay que activarlo una vez en el dashboard de Stripe (modo test): *Settings → Billing → Customer portal*.
- **Volver de Checkout** (`?checkout=success`) muestra un aviso y **no cambia el plan**: eso solo lo hace el webhook.
- Los precios que muestran la landing y `/dashboard/billing` ($29 y $99 al mes) salen de una sola constante, `PLAN_MONTHLY_PRICE_USD` (`domain/plan-prices.ts`). Son texto fijo: deben coincidir con los precios a los que apuntan `STRIPE_PRICE_PRO` y `STRIPE_PRICE_STUDIO`.
- `/dashboard/billing` muestra siempre el aviso de **modo de prueba** con la tarjeta 4242 4242 4242 4242, porque el adaptador no acepta una clave que no sea `sk_test_`.

## Webhook de Stripe (`POST /api/stripe/webhook`)

El webhook es la **única fuente de verdad** del plan (flujo 5): volver de Checkout no cambia nada.

- **Firma**: `Stripe-Signature` se verifica con el SDK oficial (`constructEvent`, HMAC sobre el cuerpo crudo, tolerancia de 5 minutos) y `STRIPE_WEBHOOK_SECRET`. Sin firma válida → `400` y nada se guarda. Los eventos `livemode` se ignoran: Gyde solo usa Stripe en modo test.
- **Eventos**:
  - `checkout.session.completed`: guarda el `customer` en el tenant de `client_reference_id`. No cambia el plan.
  - `customer.subscription.created/updated/deleted`: encuentra el tenant por `metadata.tenantId` o por el `customer` y, en una transacción, actualiza `subscriptions` y el plan del tenant. `active`, `trialing` y `past_due` con `STRIPE_PRICE_PRO` / `STRIPE_PRICE_STUDIO` dan `pro` / `studio`; cualquier otro estado o precio, `free`. Los `Entitlements` salen de `PLAN_CATALOG` según ese plan.
  - `invoice.payment_failed`: solo se registra; el plan cambia cuando Stripe actualiza la suscripción.
  - Los demás tipos responden `200` sin guardarse.
- **Idempotencia**: cada evento se registra en `stripe_events`. Uno ya procesado se ignora; uno cuyo procesamiento falló (`500`) se vuelve a aplicar cuando Stripe lo reintenta. `payload` guarda solo los campos que usa el webhook (ids, estado, precio y fechas), sin datos personales del cliente.
- **Sin tenant todavía** (`unmatched`): el evento **no** se marca procesado y se responde `500`, para que Stripe lo reintente cuando `checkout.session.completed` ya haya enlazado el `customer`.
- **Orden**: cada suscripción guarda el `created` del último evento aplicado (`subscriptions.last_event_at`). Un evento más viejo se ignora (`stale`, `200`). Como `created` tiene resolución de segundos, dentro del mismo segundo tampoco se aplica uno que haga retroceder el estado (p. ej. un `created` en `incomplete` que llega después del `updated` a `active`); ver `domain/event-order.ts`.
- **Versiones de la API**: el periodo de facturación se lee de la suscripción (API ≤ 2025-02-24) o de su primer *item* (2025-03-31 en adelante), porque los eventos llegan con la versión de la cuenta.
- **Respuestas**: `400` con firma inválida, `200` al procesar, ignorar o descartar por viejo, `500` si falta configuración, algo falla o el evento aún no encuentra tenant, para que Stripe reintente. Los logs llevan solo `eventId`, `type` y el resultado.

### Probarlo en local con la CLI de Stripe

1. En tu `.env`: `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_PRICE_PRO` y `STRIPE_PRICE_STUDIO` (ids `price_…` de precios recurrentes) y `STRIPE_WEBHOOK_SECRET` (el `whsec_…` que imprime `stripe listen --print-secret`). Nunca en el repo.
2. Reenvía los eventos a web (las versiones nuevas de la CLI exigen `--events`):

   ```bash
   stripe listen \
     --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed \
     --forward-to localhost:3000/api/stripe/webhook
   ```

3. En `/dashboard/billing`, «Mejorar a Pro» y paga con la tarjeta de prueba `4242 4242 4242 4242` (cualquier fecha futura y CVC). El plan pasa a `pro` cuando llega el webhook.
4. `stripe trigger customer.subscription.updated` crea un `customer` que no es de ningún estudio: web responde `500` (`unmatched`), como debe.

## Pantallas

- **`/dashboard/api-keys`**: crear (entorno `test`/`live` y nombre opcional), listar (prefijo y últimos 4, estado, creada, último uso) y revocar con confirmación. La clave en claro solo llega en la respuesta de creación; vive en el estado del diálogo y se descarta al cerrarlo.
- **`/dashboard/llm-config`**: proveedor, modelo (`claude-opus-5-5` por defecto, `claude-sonnet-5-5`, `claude-haiku-5-5`; ver `llm-model-options.ts`), `••••` + últimos 4, estado y fecha; guardar, reemplazar (prueba la conexión antes) y revocar con confirmación. La llave sale del estado del formulario antes de la petición (`llm-key-form.ts`). Avisa que la IA solo se usa en Pro y Studio.
- **`/dashboard/billing`**: plan actual (del webhook, con sus límites de `PLAN_CATALOG`), estado de la suscripción y fecha de renovación o fin; «Mejorar a Pro/Studio» (Checkout) en el plan free y «Gestionar suscripción» (Portal) si el estudio tiene `customer`.
- **Landing, `/auth/login`, `/dashboard` y `/dashboard/billing`**: estilos con Tailwind v4.

## Estilos

- Tailwind v4 (`@tailwindcss/postcss`) en la landing, el login, el panel y la facturación. Los estilos globales de elementos viven en una capa de CSS (`src/app/globals.css`) para que no pisen a los CSS Modules.
- `src/ui` (`Button`, `Input`, `Select`, `Card`, `Table`, `Dialog`, `CopyField`) y las pantallas de API keys y llave de IA usan **CSS Modules** (`*.module.css`) solo con tokens de `@gyde/design-tokens` (`var(--gyde-color-…)`, `--gyde-space-…`). Traen su propio anillo de foco y áreas táctiles de 44 px; por debajo de 640 px las tablas se apilan como tarjetas para no generar scroll horizontal.
- Tipografías: Bricolage Grotesque + Figtree (`src/lib/fonts.ts`, `next/font`). Contraste mínimo WCAG AA. Detalle en [`docs/design/sistema-de-diseno.md`](../../docs/design/sistema-de-diseno.md).

## Módulos

| Módulo | Responsabilidad |
|---|---|
| `src/modules/auth` | Inicio de sesión con GitHub (Auth.js v5), cuentas y *tenants* |
| `src/modules/billing` | Checkout y Portal de Stripe; webhook → suscripción → plan (`Entitlements`) |
| `src/modules/api-keys` | Emitir, listar, revocar y **verificar** API keys |
| `src/modules/llm-config` | Alta, prueba de conexión y rotación de la llave LLM del estudio, **cifrada en reposo** |
| `src/modules/dev-seed` | `seed:dev` |
| `src/app` | Rutas y páginas de Next.js, delgadas |
| `src/ui` | Componentes base |
| `src/lib` | `db` (cliente y schema Drizzle), `internal-auth`, `logger`, `fonts` |
| `src/middleware.ts` | Protege las rutas autenticadas (redirige a `/auth/login`) |

Los planes (Free / Pro / Studio) son **datos**: `PLAN_CATALOG` en `@gyde/contracts`. El resto del sistema lee `Entitlements`, no nombres de plan.

## Pruebas

```bash
pnpm --filter @gyde/web test
```

Cubren bootstrap (scripts, config de Next, tokens CSS), el schema Drizzle, casos de uso con repositorios falsos (aislamiento entre tenants, estados de las API keys), el cifrado AES-GCM (rotación y AAD), `internal-auth` y el seed.

## Docker de producción

```bash
docker build -f services/web/Dockerfile -t gyde-web .
```
