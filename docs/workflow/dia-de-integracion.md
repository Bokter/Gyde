# Día de integración: lista de verificación

Para quien conduzca la integración (el líder o, en su defecto, quien tenga el teclado) y para las cuatro áreas, que responden cada una de lo suyo. Recorre las secciones **en orden**: cada una depende de la anterior. En cada paso hay el **comando exacto**, el **resultado esperado** y **qué área responde si falla**.

Estado de cada paso, a **2026-10-12** (se actualiza el día de la integración):

- ✅ **Verificado** con el stack real, con el comando tal cual está escrito.
- ⏳ **Pendiente de integrar**: el comando y el resultado salen de los README y los contratos; no se ha podido ejecutar todavía y puede necesitar ajustes. Dice qué falta.

## Reglas del día

1. **Una sola persona conduce** y comparte pantalla; las demás miran y responden de lo suyo.
2. **Se parte de `dev` limpio**: `git switch dev && git pull`, con el CI de `dev` en verde. Nada de ramas locales ni de archivos sin versionar en la prueba.
3. **Nadie arregla fuera de su carpeta** durante la prueba (ver «Quién responde de qué»). Un fallo se anota con la plantilla del final y lo arregla su dueño en un PR pequeño.
4. **Un fallo no se salta**: si un paso no da el resultado esperado, se detiene el recorrido en ese punto.

## Quién responde de qué

| Área | Responsable | Módulos |
|---|---|---|
| **1** Plataforma, Gateway y Resiliencia | @FatimaCas | `resilience`, `discovery`, `registry`, `gateway`, `infra/` (compose, Dockerfiles, scripts) y el CI |
| **2** Web, Pagos y Superficies | @kicconsu | `web` (inicio de sesión, Stripe, API keys, llave de IA del estudio), `github-action`, `vscode-extension`, `design-tokens` |
| **3** Conocimiento | @Bokter | `normalization`, `retrieval`, `fixtures/sources` |
| **4** Motor, LLM y Reportes | @JDBorjaC | `analysis-engine`, `cli`, `llm-analysis`, `reports`, `fixtures/projects` |

Cuando el síntoma no apunta a un solo módulo, la tabla de «Si falla» de cada sección dice por dónde empezar. `@gyde/contracts` y `@gyde/service-kit` los mantiene el líder.

## 0. Preparación

```bash
git switch dev && git pull
node infra/scripts/bootstrap-env.mjs                 # crea .env con secretos locales; no pisa uno existente
grep -E '^(LLM_MOCK_ENABLED|INTERNAL_SERVICE_TOKEN)=' .env | sed 's/=.*token.*/=<oculto>/'
```

Todos los comandos de compose de este documento usan esta variable (puesta una vez por terminal):

```bash
C="docker compose -p gyde-int --env-file .env -f infra/compose/compose.yaml"
```

> **`--env-file .env` es obligatorio.** El archivo de compose vive en `infra/compose`, y sin esa opción las variables del `.env` de la raíz no llegan a sus `${...}` (contraseñas de la base de datos y token interno quedarían con valores distintos según el servicio). Si algo falla con `password authentication failed` o con `401` entre servicios, empieza por revisar que se usó.

**Esperado:** `.env` existe y muestra `LLM_MOCK_ENABLED=true`. **Si falla:** Área 1 (`infra/scripts/bootstrap-env.mjs`).

## 1. El stack completo con `docker compose`

```bash
$C down -v                                           # estado limpio (borra la base de datos local)
$C up -d --build                                     # todos los servicios
$C ps --format "table {{.Service}}\t{{.Status}}"
```

**Esperado:** postgres, registry, web, gateway, normalization, retrieval, llm-analysis y reports en `Up ... (healthy)`. Tarda un par de minutos la primera vez (construye la imagen).

**Estado:** ✅ postgres, registry, normalization, retrieval, reports, llm-analysis y web quedan `healthy` con este comando. El gateway ya implementa autenticación y enrutado (#62), pero su recorrido aún no se ha verificado con el stack: ver la sección 3.

Comprobar cada servicio por su puerto (`/healthz`; `readyz` además comprueba la base de datos en normalization y, cuando Reports usa PostgreSQL, también en reports):

```bash
for p in 3000 4000 4100 4200 4300 4400 4500; do printf "%s: " $p; curl -s -o /dev/null -w "%{http_code}\n" localhost:$p/healthz; done
curl -s localhost:4200/readyz                        # {"status":"ready",...,"checks":{"database":"ok"}}
curl -s localhost:4500/readyz                        # igual, tras el merge de la persistencia de Reports
```

**Esperado:** siete `200` y `readyz` en `ready`.

El registry **lista las instancias** que se registraron solas al arrancar (necesita el token interno):

```bash
T=$(grep '^INTERNAL_SERVICE_TOKEN=' .env | cut -d= -f2)
for s in gateway web normalization retrieval llm-analysis reports; do
  printf "%s: " $s
  curl -s -H "x-internal-token: $T" localhost:4100/v1/services/$s | node -e '
    let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
      const j = JSON.parse(t); console.log(j.instances.map((i) => `${i.instanceId} healthy=${i.healthy}`).join(", ") || "(ninguna)");
    });'
done
```

**Esperado:** una instancia `healthy=true` por servicio. **Estado:** ✅ normalization, retrieval, llm-analysis y reports se registran solas. ⏳ `web` aparece como «(ninguna)» (hoy no se auto-registra); el gateway ya tiene lógica real (#62) pero su auto-registro no se ha observado: confirmar con las áreas 2 y 1 si es lo esperado para la demo.

| Si falla | Responde |
|---|---|
| Un servicio no llega a `healthy`, o `docker compose up` falla | Área 1 (compose/Dockerfile) si es de arranque; el dueño del servicio si el log muestra un error de su código (`$C logs <servicio>`) |
| `password authentication failed` en normalization o reports | Área 1: el compose y `infra/postgres/init/01-schemas.sql` deben usar la misma contraseña por rol |
| Una instancia no aparece en el registry | Área 1 (`registry`/`discovery`) si el servicio dice que se registró; el dueño del servicio si no intenta registrarse |

## 2. Conocimiento: ingesta y consulta (Área 3)

```bash
curl -s -X POST -H "x-internal-token: $T" localhost:4200/internal/ingest/osv
curl -s -X POST -H "x-internal-token: $T" localhost:4200/internal/ingest/osv      # repetir: no cambia nada
curl -s -H "x-internal-token: $T" localhost:4200/internal/sources
curl -s -X POST -H "x-internal-token: $T" -H 'content-type: application/json' localhost:4200/internal/knowledge/query \
  -d '{"packages":[{"ecosystem":"nuget","name":"Acme.Serialization","version":"1.4.0"}]}'
```

**Esperado:**

1. La primera ingesta devuelve `"recordsProcessed":3`; la segunda, `"recordsProcessed":0`.
2. `/internal/sources` muestra `osv` con `"status":"ok"` y `lastIngestedAt`.
3. La consulta devuelve los ids `osv:SAMPLE-0001` y `osv:SAMPLE-0003` (candidatos por paquete, **no** por versión) y **no** `SAMPLE-0002`.

**Estado:** ✅ verificado. | **Si falla:** Área 3 (`normalization`); si es un error de conexión a la base de datos, Área 1 (credenciales del compose).

## 3. Recorrido por el gateway real (⏳ pendiente de integrar)

> El gateway ya implementa autenticación de API keys y el enrutado a Reports (#62), pero esta sección **aún no se ha verificado con el stack real**, así que sigue ⏳. Necesita una **API key** emitida por la web (sección 6, paso 2) en la variable `KEY`.

```bash
G=http://localhost:4000
KEY=<la API key>

# 1. Verificar la key (plan y permisos)
curl -s -H "Authorization: Bearer $KEY" $G/v1/auth/verify
# 2. Una key inválida o ausente
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer gyde_test_invalida" $G/v1/auth/verify
curl -s -o /dev/null -w "%{http_code}\n" $G/v1/auth/verify
# 3. El gateway nunca enruta /internal/*
curl -s -o /dev/null -w "%{http_code}\n" -H "x-internal-token: $T" $G/internal/analyses
# 4. Crear el análisis con el proyecto de ejemplo y esperar el reporte
BODY=$($C exec -T retrieval pnpm --filter @gyde/retrieval exec tsx ../../infra/scripts/smoke/make-job.ts request noai | tail -n1)
curl -s -X POST -H "Authorization: Bearer $KEY" -H 'content-type: application/json' $G/v1/analyses -d "$BODY"
curl -s -H "Authorization: Bearer $KEY" $G/v1/analyses/<analysisId>             # repetir hasta "status":"ready"
curl -s -H "Authorization: Bearer $KEY" $G/v1/analyses/<analysisId>/markdown
```

(El paso 4 usa `make-job.ts request`, que se añade con el humo del gateway; hasta entonces el cuerpo es `sampleAnalysisRequest` de `@gyde/contracts/samples` con `options.includeAi=false`.)

**Esperado:**

1. `200` con el plan y los permisos del tenant de la key.
2. `401` en los dos casos (key inválida y sin cabecera).
3. `404`, `401` o `403`: cualquier cosa menos `2xx` y `501`; el gateway no sirve rutas internas.
4. `202` con `analysisId`; el `GET` llega a `ready` con **los dos hallazgos esperados** (sección 4) y el Markdown los lista.
5. Con `reports` apagado (`$C stop reports`): `POST /v1/analyses` responde **`503 upstream_unavailable`**, sin colgarse (arrancar de nuevo con `$C start reports`).
6. Los límites del plan: una key de un plan agotado responde `402 plan_limit_exceeded` y más peticiones de las permitidas por minuto, `429`.

| Si falla | Responde |
|---|---|
| `401` con una key válida | Área 1 (gateway) o Área 2 (`POST /internal/api-keys/verify` de la web): mirar `$C logs web gateway` para ver quién rechazó |
| `404`/`500` al crear o leer el análisis | Área 1 si el gateway no reenvía; Área 4 si Reports responde un error (`$C logs reports`) |
| El reporte queda en `retrieving` | Área 4 (Reports) si el log muestra que no entregó a tiempo; mirar antes `$C logs retrieval` por si Retrieval no pudo entregar (Área 3). Reports sí tiene temporizador en ese estado desde #52 |
| `/internal/*` responde `2xx` | Área 1, bloqueante: nunca debe pasar |

El humo (`infra/scripts/smoke-retrieval.sh`) cubre esta sección sola cuando se le da la key (ver la sección 7).

## 4. Los tres casos de reporte

Mismo proyecto de ejemplo y mismas expectativas en cada caso. **Los dos hallazgos esperados**, en este orden (`fixtures/README.md`):

1. `Acme.Serialization 1.4.0 is affected by SAMPLE-0001`: severidad **alta**, CVSS **7.5**, arreglo en 1.5.0.
2. `Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution`: severidad **media**.

Y **ninguno** por `SAMPLE-0002` (otro paquete) ni `SAMPLE-0003` (rango 2.0.0 a 2.1.0, que no incluye 1.4.0).

El humo ejecuta los tres casos y comprueba todo lo de arriba:

```bash
bash infra/scripts/smoke-retrieval.sh                 # KEEP_STACK=1 deja el stack encendido
```

| Caso | Plan | IA | llm-analysis | Esperado en el reporte |
|---|---|---|---|---|
| 1 | Free | no | encendido | `ready`, `degraded=false`, capas `basic, license-compliance, severity-score`, sin `aiExplanation` |
| 2 | Pro | sí | encendido, `LLM_MOCK_ENABLED=true` | `ready`, `degraded=false`, capas con `ai-enrichment`, `aiExplanation` en cada hallazgo |
| 3 | Pro | sí | **apagado** | `ready`, `degraded=true`, `degradedReason=llm-unavailable`, los mismos hallazgos, sin `aiExplanation` |

**Estado:** ✅ verificado (`SMOKE TEST PASSED`, 1 min 30 s con la base limpia). El humo crea los análisis directamente en Reports (`POST /internal/analyses`); por el gateway, ver la sección 3.

Para hacerlo a mano, el cuerpo de `POST /internal/analyses` sale de `infra/scripts/smoke/make-job.ts` (`tsx make-job.ts <free|pro> <ai|noai>`) y el reporte se lee con `GET /internal/analyses/<id>` (cabecera `x-internal-token`).

| Si falla | Responde |
|---|---|
| Faltan hallazgos, sobran (`SAMPLE-0002/3`) o el orden cambia | Área 3 (`retrieval`/`normalization`) |
| El caso 2 sale degradado con `llm-unavailable` aunque `llm-analysis` está sano | Primero comprobar que `web` está encendido (llm-analysis le pide la configuración del tenant): Área 1 si falta la dependencia en el compose; Área 4 si `web` está sano y aun así falla |
| El caso 2 no trae `aiExplanation` | Área 4 (`llm-analysis`/`reports`) |
| El caso 3 no sale degradado, o tarda mucho | Área 4 (Reports) y Área 3 (el aviso `llm-unavailable` lo publica Retrieval si no llega a `llm-analysis`) |
| Un análisis se queda en `retrieving` | Área 4 (Reports), aunque ya hay temporizador en ese estado (#52); Área 3 si el log de Retrieval muestra que no pudo entregar |

## 5. Privacidad de punta a punta

La promesa: **el código fuente del cliente nunca sale de su entorno**, y los secretos (API keys, llave de IA del estudio) no aparecen en logs ni en la base de datos en claro. El proyecto de ejemplo `fixtures/projects/unity-sample` contiene en `Assets/Scripts/Player.cs` la marca `PROPRIETARY_MARKER_DO_NOT_SEND`.

### 5.1 La solicitud que sale del cliente (⏳ necesita el gateway de la Área 1)

Capturar lo que la CLI manda de verdad, con un proxy de registro entre la CLI y el gateway:

```bash
# Terminal 1: proxy que anota cada cuerpo y reenvía al gateway
node -e '
  const { createServer } = require("node:http"); const { appendFileSync } = require("node:fs");
  createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    appendFileSync("gyde-captured.log", `${req.method} ${req.url}\n${body}\n\n`);
    const up = await fetch("http://localhost:4000" + req.url, { method: req.method, headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" }, body: body.length ? body : undefined });
    res.statusCode = up.status; res.end(Buffer.from(await up.arrayBuffer()));
  }).listen(4999);'

# Terminal 2: analizar el proyecto de ejemplo a través del proxy
GYDE_API_KEY=$KEY GYDE_API_URL=http://localhost:4999 pnpm --filter @gyde/cli dev -- analyze fixtures/projects/unity-sample
grep -c PROPRIETARY_MARKER_DO_NOT_SEND gyde-captured.log      # debe imprimir 0
grep -c '"dependencies"' gyde-captured.log                    # debe ser >= 1 (sí viaja la lista de dependencias)
rm gyde-captured.log
```

**Esperado:** `0` y un número mayor o igual a `1`; el cuerpo capturado solo contiene `client`, `project`, `dependencies` y `options` (el esquema estricto `AnalysisRequest`): nada de rutas de archivos, fragmentos de código ni URLs de repositorios. **Si falla:** Área 4 (`analysis-engine`, `buildAnalysisRequest`); de la prueba de arquitectura de privacidad (`packages/analysis-engine/test/acceptance.test.ts`) responde también el Área 4.

### 5.2 Ni en los logs ni en la base de datos

```bash
$C logs 2>&1 | grep -c PROPRIETARY_MARKER_DO_NOT_SEND                                  # 0
$C logs 2>&1 | grep -c "$T"                                                            # 0: el token interno no se escribe
$C logs 2>&1 | grep -c "$(grep '^AUTH_SECRET=' .env | cut -d= -f2)"                    # 0
$C exec -T postgres pg_dump -U gyde gyde | grep -c PROPRIETARY_MARKER_DO_NOT_SEND      # 0
$C exec -T postgres pg_dump -U gyde gyde | grep -c "$T"                                # 0
```

**Esperado:** cinco `0`. **Estado:** ✅ verificado tras el humo. Tras la demo, repetir con la API key real y la llave de IA real: `$C logs 2>&1 | grep -c "<la key>"` debe dar `0` para ambas. **Si falla:** el dueño del servicio que escribió el secreto (el nombre del contenedor está al inicio de cada línea de `$C logs`); un fallo del logger lo arregla el líder (`@gyde/service-kit`).

### 5.3 Secretos en reposo (⏳ requiere haber creado una key y una llave de IA en la web)

```bash
$C exec -T postgres psql -U gyde -d gyde -c "select prefix, key_last4, left(key_hash, 12) as hash_inicio, length(key_hash) from web.api_keys"
$C exec -T postgres psql -U gyde -d gyde -c "select provider, key_last4, kid, left(encrypted_key, 12) as cifrado_inicio from web.llm_configs"
```

**Esperado:** la tabla de API keys solo guarda el prefijo, los últimos 4 y un **hash**; la de llaves de IA guarda la llave **cifrada** (`encrypted_key`, `iv`, `auth_tag`, `kid`), nunca en claro. La clave completa y la llave de IA no aparecen en ninguna de las dos. **Si falla:** Área 2 (`web`).

### 5.4 Lo interno no sale por el gateway

Cubierto en la sección 3, paso 3 (`/internal/*` por el gateway no responde `2xx`). **Si falla:** Área 1, bloqueante.

## 6. Los pasos de la demo

Los seis pasos de [`docs/tasks/00-resumen.md`](../tasks/00-resumen.md), con comando y evidencia. Se hace **tras** las secciones 1 a 5.

| # | Paso | Comando o acción | Evidencia esperada | Responde |
|---|---|---|---|---|
| 1 | El stack sube y el registry lista las instancias | Sección 1 | Servicios `healthy` y una instancia por servicio en el registry | Área 1 |
| 2 | En la web: iniciar sesión con GitHub, elegir un plan con Stripe (modo **test**), crear una API key y guardar la llave de IA del estudio | Navegador en `http://localhost:3000`. Tarjeta de prueba de Stripe: `4242 4242 4242 4242`. La API key se muestra **una sola vez**: guardarla en `KEY` | Plan activo, la key en `/dashboard/api-keys` y la llave de IA con solo los últimos 4 visibles. ⏳ Stripe y la llave de IA de la web aún no están integrados (hoy: inicio de sesión y API keys) | Área 2 |
| 3 | `gyde analyze` imprime el reporte priorizado con la vulnerabilidad alta, el riesgo de licencia y la explicación de IA | `GYDE_API_KEY=$KEY pnpm --filter @gyde/cli dev -- analyze fixtures/projects/unity-sample` (con `LLM_MOCK_ENABLED=true` la explicación sale del mock; con una llave real, del proveedor). La CLI está integrada (#59): `--format text|json|markdown` y `--fail-on-degraded` | Los dos hallazgos esperados y `aiExplanation` en cada uno | Área 4 (CLI y reporte); Área 3 (hallazgos) |
| 4 | **Apagar `llm-analysis`**: el reporte sale **degradado** y, tras 5 fallos, el **Circuit Breaker** abre y el resultado llega al instante | `$C kill llm-analysis` y repetir el análisis 7 veces (humo, caso 3, o la CLI) | `degraded=true`, `llm-unavailable`, los hallazgos determinísticos intactos. ✅ medido: las primeras 4 respuestas tardan unos 5 s cada una; desde la 5.ª, unos 0,25 s, y el log de Retrieval pasa de `fetch failed` a `its circuit is open` | Área 3 (breaker de Retrieval), Área 4 (degradado en Reports), Área 1 (`resilience`) |
| 5 | La instancia caída desaparece del registry (Health Checker) | tras el paso 4: `curl -s -H "x-internal-token: $T" localhost:4100/v1/services/llm-analysis` | `"instances":[]` pocos segundos después de apagarla. ✅ medido: unos **10 s** tras `docker kill` (sin des-registro limpio); con `HEALTH_CHECK_INTERVAL_MS=5000` y `HEALTH_CHECK_MAX_FAILURES=3` el máximo esperado ronda los 15 a 20 s | Área 1 (`registry`) |
| 6 | Verificar que no viaja código fuente | Sección 5 | La marca `PROPRIETARY_MARKER_DO_NOT_SEND` no aparece en la captura, los logs ni la base de datos | Área 4 (el cliente), todas las áreas (logs) |

Al terminar el paso 6, **volver a levantar `llm-analysis`** (`$C up -d llm-analysis`) y comprobar que se registra de nuevo y que el siguiente análisis ya no sale degradado (el circuito vuelve a cerrar tras su tiempo de espera, `CB_OPEN_TIMEOUT_MS`, 15 s por defecto).

## 7. El humo, y el humo del gateway

```bash
bash infra/scripts/smoke-retrieval.sh                       # sin gateway: las secciones 1, 2 y 4
SMOKE_API_KEY=<key> bash infra/scripts/smoke-retrieval.sh   # además, la sección 3 por el gateway
```

El script termina con `SMOKE TEST PASSED` o con `SMOKE TEST FAILED: <motivo>` y código de salida distinto de cero. Si no se le da `SMOKE_API_KEY`, o el gateway no está disponible todavía, la parte del gateway se **omite avisándolo** (no cuenta como éxito de esa parte).

## 8. Plantilla para anotar un fallo

```
Sección y paso:       (p. ej. 4, caso 3)
Comando ejecutado:    ...
Esperado:             ...
Obtenido:             (salida, código HTTP)
Logs relevantes:      $C logs <servicio> --since 2m
Responde:             Área N, @persona
```

Se anota en el PR o issue del Área que responde, con esta plantilla; quien conduce no sigue hasta que el fallo tenga dueño.

## 9. Al terminar

1. `$C down` (o `$C down -v` para empezar de cero la próxima vez).
2. Todas las secciones con ✅ o con su fallo anotado y con dueño; ninguna a medias.
3. Actualizar este documento: pasar los ⏳ que ya se ejecutaron a ✅ con la fecha, y borrar las notas que dejaron de aplicar.
