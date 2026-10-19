# Guion de la demo

Seis escenas para mostrar el sistema funcionando y **fallando con gracia**. Cada una trae el **comando exacto**, **qué debe verse**, **qué patrón demuestra** y **el archivo del código** donde vive. Las salidas de este documento son **reales**: se ejecutaron el 2026-10-12 sobre `dev` @ `7c3576e` con el stack de `docker compose` reconstruido (`up -d --build`). Las claves y el token interno aparecen como `***` o `<token>`; las demás cifras (ids, tiempos, puntajes) son las que se imprimieron.

| # | Escena | Qué se ve | Patrón que demuestra |
|---|---|---|---|
| a | Flujo feliz con un estudio **free** | Informe con 2 hallazgos, capas `basic → license-compliance → severity-score`, sin IA | Template Method, Abstract Factory, Decorator |
| b | Estudio **Pro** con IA | Las cuatro capas, con `ai-enrichment` antes de `severity-score` | Decorator (`composeReport`) |
| c | **Degradado** y recuperación (`stop llm-analysis`) | Informe `degraded` pero con los mismos hallazgos; el Circuit Breaker abre y luego cierra | Circuit Breaker, Service Discovery |
| d | **503** con `stop reports` y recuperación | El gateway responde `503 upstream_unavailable` en lugar de colgarse | Circuit Breaker, Service Discovery |
| e | **Aislamiento entre estudios** | Otro estudio pide mi análisis y recibe el mismo `404` que un id inexistente | Reglas de capas (el dominio decide, el borde propaga) |
| f | **Persistencia** tras reiniciar `reports` | El mismo id sigue ahí; y el barrido de arranque cierra lo que quedó a medias | Repositorio detrás de un puerto (Clean Architecture) |

> **Quién responde si algo falla:** las tablas «Si falla» de [`dia-de-integracion.md`](dia-de-integracion.md). Este guion no las repite.

## 0. Preparación

```bash
git switch dev && git pull
node infra/scripts/bootstrap-env.mjs                                  # crea .env si no existe; no pisa uno existente
C="docker compose -p gyde --env-file .env -f infra/compose/compose.yaml"
$C up -d --build
$C ps --format "table {{.Service}}\t{{.Status}}"                      # los 8 en (healthy)
```

> **Si el puerto 5432 o el 3000 están ocupados** (otro proyecto en la misma máquina), `up` falla con `Bind for 0.0.0.0:5432 failed: port is already allocated`. Cámbialos solo para ese comando, sin tocar el `.env`: `POSTGRES_PORT=15432 WEB_PORT=13000 $C up -d`. Entre contenedores no cambia nada (siguen usando 5432 y 3000 por dentro). ✅ Verificado el 2026-10-12.

Los comandos usan `bash` y `docker compose` (en Windows, Git Bash). `$C` es el alias de arriba; hay que ponerlo en cada terminal.

### 0.1 Los estudios y sus claves

`seed:dev` crea **un solo** estudio, con slug fijo (`gyde-dev-seed`, plan free): ejecutarlo otra vez no crea otro. Para la demo hacen falta tres (dos free para el aislamiento y uno Pro), así que se crean con esta función. Es lo mismo que hace la web al crear una clave: `gyde_test_` + 32 bytes aleatorios en hex, y en la base solo se guarda su **SHA-256** (`generateApiKey` en `services/web/src/modules/api-keys/application/generate-api-key.ts`). La clave se imprime **una vez**, al crearla.

```bash
mk_tenant() {   # mk_tenant <slug> <free|pro|studio>   imprime la API key una sola vez
  local slug=$1 plan=$2 key hash
  key="gyde_test_$(openssl rand -hex 32)"
  hash=$(printf %s "$key" | sha256sum | cut -d' ' -f1)
  $C exec -T postgres psql -U gyde -d gyde -v ON_ERROR_STOP=1 -q <<SQL
begin;
with u as (
  insert into web.users (github_id, login, name) values ('dev-$slug', '$slug', '$slug') returning id
), t as (
  insert into web.tenants (name, slug, owner_id, plan) select '$slug', '$slug', id, '$plan' from u returning id
)
insert into web.api_keys (tenant_id, prefix, key_hash, key_last4, name, environment)
select id, 'gyde_test_', '$hash', '${key: -4}', 'demo', 'test' from t;
commit;
SQL
  printf %s "$key"
}

KA=$(mk_tenant demo-estudio-a free)
KB=$(mk_tenant demo-estudio-b free)
KP=$(mk_tenant demo-pro pro)       # el plan Pro se asigna así: la demo no necesita una cuenta de Stripe
G=http://localhost:4000

# El cuerpo de la petición (el proyecto de ejemplo ya parseado), sin y con IA
mkbody() { $C exec -T retrieval pnpm --filter @gyde/retrieval exec tsx ../../infra/scripts/smoke/make-job.ts request "$1" | tail -n1; }
BODY=$(mkbody noai)
BODY_AI=$(mkbody ai)
```

**Sin pasar por Stripe**, subir un estudio a Pro a mano es una sola sentencia (útil si ya tienes uno): `$C exec -T postgres psql -U gyde -d gyde -c "update web.tenants set plan='pro' where slug='demo-estudio-a'"`.

Comprobar que el gateway las acepta y ve el plan correcto:

```bash
curl -s -H "Authorization: Bearer $KA" $G/v1/auth/verify
curl -s -H "Authorization: Bearer $KP" $G/v1/auth/verify
```

```text
{"plan":"free","entitlements":{"plan":"free","limits":{"analysesPerMonth":30,"projects":1},"features":{"licenseCompliance":true,"compatibilityAnalysis":false,"severityScoring":true,"aiEnrichment":false}}}
```

(La del Pro devuelve `"plan":"pro"` con `aiEnrichment` en `true`.) Si la clave no es válida, el gateway responde `401`.

> **La IA de la demo es el mock.** `LLM_MOCK_ENABLED=true` en el `.env` hace que `llm-analysis` use `MockFindingAnalyzer` (`services/llm-analysis/src/infrastructure/adapters/mock-finding-analyzer.adapter.ts`) y no necesita ninguna llave de IA del estudio. Con un proveedor real hay que guardar la llave del estudio en `/dashboard/llm-config` de la web ([ADR 0007](../adr/0007-llaves-llm-por-estudio-byok.md)).

### 0.2 Convenciones de las escenas

- El CLI se ejecuta con `pnpm --filter @gyde/cli dev analyze …`. La ruta va **absoluta** y **sin `--`** antes de `analyze` (pnpm lo pasaría como ruta), porque el script corre con cwd en `apps/cli`.
- El CLI sale con **1** si hay un hallazgo `high` o peor (`--fail-on high` por defecto), y pnpm lo acompaña con un `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … Exit status 1`. **Es normal**: es el código de salida del CLI, no un fallo del sistema. Con `--fail-on none` el CLI sale con 0 y pnpm no añade nada.
- `LC_ALL=C` evita que `printf` use coma decimal en terminales en español.
- `resumen` imprime en una línea lo importante de un informe JSON (se usa en las escenas b, c y f). Se define una vez por terminal:

```bash
resumen() { node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify({status:j.status,degraded:j.degraded,degradedReason:j.degradedReason,appliedLayers:j.appliedLayers,riskScore:j.summary.riskScore,findings:j.findings.length,aiExplanation:j.findings.some(f=>f.aiExplanation)}))'; }
analizar() { GYDE_API_KEY=$1 pnpm --filter @gyde/cli dev analyze "$PWD/fixtures/projects/unity-sample" "${@:2}"; }
```

Las esperas tienen **tope** (60 intentos) para que un paso que no llega nunca no deje la terminal colgada:

```bash
esperar_ready() { for _ in $(seq 60); do [ "$(curl -s -H "Authorization: Bearer $1" $G/v1/analyses/$2 | sed -E 's/.*"status":"([a-z]+)".*/\1/')" = ready ] && return 0; sleep 1; done; echo "el análisis $2 no llegó a ready" >&2; return 1; }
esperar_sano()  { for _ in $(seq 60); do [ "$($C ps $1 --format '{{.Health}}')" = healthy ] && return 0; sleep 2; done; echo "$1 no llegó a healthy" >&2; return 1; }
```

### 0.3 Un análisis de referencia

Las escenas d, e y f reutilizan un análisis ya terminado (`$ID`). Se crea una vez, con el estudio A:

```bash
ID=$(curl -s -X POST -H "Authorization: Bearer $KA" -H 'content-type: application/json' $G/v1/analyses -d "$BODY" | sed -E 's/.*"analysisId":"([^"]+)".*/\1/')
esperar_ready $KA $ID
echo "análisis de referencia: $ID"
```

---

## Escena a: flujo feliz con un estudio free

**Qué se demuestra.** Un estudio free analiza un proyecto Unity: el CLI detecta el motor, parsea **en local**, manda **una** petición con nombres y versiones (nunca código) y recibe el informe con las capas que su plan permite, sin IA.

```bash
analizar $KA; echo "exit code: $?"
```

```text
$ tsx src/main.ts analyze /home/wizuz/software2/Gyde/fixtures/projects/unity-sample
Gyde · análisis 22af3b3c-eeba-4d8a-8050-257d2b5b5e09
Estado: ready
Resumen: 0 crítica, 1 alta, 1 media, 0 baja, 0 info · riesgo 57/100

[ALTA] Acme.Serialization 1.4.0 is affected by SAMPLE-0001 — Acme.Serialization@1.4.0
  Evidencia (osv): Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.
  Impacto: Acme.Serialization 1.4.0 is inside the affected range (introduced 0, fixed 1.5.0) of SAMPLE-0001.
  Recomendación: Upgrade Acme.Serialization to 1.5.0 or later.

[MEDIA] Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution — Acme.GplToolkit@2.1.0
  Evidencia (spdx): GPL-3.0-only is a strong copyleft license.
  Impacto: Distributing a game that includes it can require offering the source of the whole combined work under the same license.
  Recomendación: Replace the dependency or confirm with legal that your distribution model allows it.
exit code: 1
```

**Qué debe verse.** Los **dos** hallazgos esperados (alta por `SAMPLE-0001`, media por la licencia GPL), `riesgo 57/100`, **ninguna** línea de «degradado» ni de IA, y el código de salida **1** (hay un hallazgo `high`). El `57` se puede comprobar a mano: alta (7) + media (4) = 11 de 20 posibles × 90 = 49,5, más el bono CVSS 7,5 → 57 (`severity-score.decorator.ts`).

Las capas del plan free, tal como las devuelve la API (`--format json`, o el `GET /v1/analyses/<id>` de la escena e):

```text
"appliedLayers":["basic","license-compliance","severity-score"],"degraded":false
```

**Patrones que demuestra y dónde viven.**

| Patrón | Qué se ve en esta escena | Archivo |
|---|---|---|
| **Template Method** | Los pasos corren siempre en el mismo orden (autenticar → parsear → enviar → vulnerabilidades → licencias → reporte → publicar); el CLI solo rellena `parseDependencies` y `publishResult` | `packages/analysis-engine/src/pipeline/analysis-pipeline.ts:67` (`runAnalysis`), `local-cli.pipeline.ts` |
| **Abstract Factory** | El CLI detectó `unity` y la fábrica entregó el **par** parser C# + fetcher OSV; nunca un parser C++ con OSV | `packages/analysis-engine/src/toolchain/create-toolchain.ts:25` (el único `switch`), `ports.ts:28`, `unity/unity-toolchain.factory.ts` |
| **Decorator** | La cadena que el plan free permite: básico → licencias → severidad, **sin** IA | `services/reports/src/domain/report/compose-report.ts:28` |
| Privacidad | Solo viajan nombres, versiones y licencias | `packages/analysis-engine/src/privacy/build-analysis-request.ts:12` |

**Las pruebas que protegen esos patrones** (se pueden mostrar en vivo, ~2 s):

```bash
pnpm --filter @gyde/analysis-engine exec vitest run test/analysis-pipeline.test.ts test/toolchain.test.ts --reporter=verbose
pnpm --filter @gyde/reports exec vitest run test/report-decorator.test.ts --reporter=verbose
```

```text
 ✓ toolchain.test.ts > createToolchainFactory (Abstract Factory) > Unity builds the C# parser together with the OSV fetcher
 ✓ toolchain.test.ts > createToolchainFactory (Abstract Factory) > Unreal builds the C++ parser together with the NVD fetcher
 ✓ analysis-pipeline.test.ts > AnalysisPipeline (Template Method) > runs the steps in the documented order and returns the final report
 ✓ analysis-pipeline.test.ts > AnalysisPipeline (Template Method) > stops before parsing anything when the API key is rejected
 ✓ analysis-pipeline.test.ts > architecture rule: the template method is final by convention > [Function LocalCLIPipeline] does not override runAnalysis
 ✓ analysis-pipeline.test.ts > architecture rule: the template method is final by convention > [Function GitHubActionPipeline] does not override runAnalysis
 Tests  6 passed (6)
 ✓ report-decorator.test.ts > … composeReport: free plan = basic + license + severity, never the AI layer
 ✓ report-decorator.test.ts > … SeverityScoreDecorator runs last so the score covers the layers before it
 ✓ report-decorator.test.ts > … never mutates the content of the wrapped component
 Tests  13 passed (13)   (se muestran 3 de las 13)
```

---

## Escena b: estudio Pro con IA

**Qué se demuestra.** El mismo proyecto, ahora con un plan que incluye IA: el informe suma la capa `ai-enrichment` **antes** de `severity-score` (que va siempre última para que su puntaje cubra lo anterior) y cada hallazgo trae su explicación.

```bash
analizar $KP --format json --fail-on none | sed -n '/^{/,$p' > informe-pro.json
node -e 'const j=JSON.parse(require("fs").readFileSync("informe-pro.json","utf8"));console.log(JSON.stringify({status:j.status,degraded:j.degraded,appliedLayers:j.appliedLayers,riskScore:j.summary.riskScore,findings:j.findings.map(f=>({title:f.title,severity:f.severity,aiExplanation:f.aiExplanation}))},null,2))'
rm informe-pro.json
```

```json
{
  "status": "ready",
  "degraded": false,
  "appliedLayers": ["basic", "license-compliance", "ai-enrichment", "severity-score"],
  "riskScore": 57,
  "findings": [
    {
      "title": "Acme.Serialization 1.4.0 is affected by SAMPLE-0001",
      "severity": "high",
      "aiExplanation": "Mock explanation 1 for \"Acme.Serialization 1.4.0 is affected by SAMPLE-0001\" (high): the deterministic engine already matched it, and this text stands in for the model's reasoning."
    },
    {
      "title": "Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution",
      "severity": "medium",
      "aiExplanation": "Mock explanation 2 for \"Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution\" (medium): the deterministic engine already matched it, and this text stands in for the model's reasoning."
    }
  ]
}
```

(Aquí `appliedLayers` está en una sola línea para ahorrar espacio; `JSON.stringify(…, null, 2)` lo imprime con un elemento por línea. El contenido es el mismo.)

Y el mismo informe en Markdown, que es lo que ve el usuario en un comentario de PR (`--format markdown`); cada hallazgo lleva su **«Explicación IA»**:

```bash
analizar $KP --format markdown --fail-on none
```

```text
**Estado:** ready · **Riesgo:** 57/100
…
### Acme\.Serialization 1\.4\.0 is affected by SAMPLE\-0001
**Recomendación:** Upgrade Acme\.Serialization to 1\.5\.0 or later\.
**Explicación IA:** Mock explanation 1 for "Acme\.Serialization 1\.4\.0 is affected by SAMPLE\-0001" \(high\): …
```

**Qué debe verse.** `degraded:false`, las **cuatro** capas en ese orden, y `aiExplanation` en **cada** hallazgo. El puntaje no cambia (57): la IA explica, no puntúa.

**Qué pasó por debajo.** Reports guardó el resultado determinístico (`analyzing`) → Retrieval despachó la evidencia a `llm-analysis` → este pidió la configuración del estudio a Web, generó las explicaciones (mock), las validó contra el esquema `AiResult` y las publicó a Reports → Reports compuso el informe.

**Patrón y archivos.**

| Patrón | Qué se ve | Archivo |
|---|---|---|
| **Decorator** | `composeReport` arma la cadena según los permisos del plan **en tiempo de ejecución**: `Basic → LicenseCompliance → AiEnrichment → SeverityScore` | `services/reports/src/domain/report/compose-report.ts:28` |
| Decorator concreto de IA | **Mezcla** el `AiResult` por id de hallazgo, respeta su prioridad y descarta ids que no existen (un modelo que inventa un id no rompe el informe) | `services/reports/src/domain/report/decorators/ai-enrichment.decorator.ts:17` |
| Orden fijo de la severidad | Va última para que su puntaje cubra lo anterior | `…/decorators/severity-score.decorator.ts:24` |
| Servicio de IA | Sin llave → `llm-not-configured`; proveedor caído → `llm-unavailable`; nunca lanza hacia quien llama | `services/llm-analysis/src/application/use-cases/analyze-findings.use-case.ts:60` (`execute`, que captura todo), `:94` (`llm-not-configured`) y `:76` (`llm-unavailable`) |

**Línea para el micrófono:** «Free es básico + licencias + severidad; Pro añade IA. No hay una clase por combinación: son capas que se apilan».

---

## Escena c: degradado y recuperación (`stop llm-analysis`)

**Qué se demuestra.** Si el servicio de IA cae, el análisis **no falla**: el informe sale igualmente, con los mismos hallazgos, marcado como degradado. Tras 5 fallos el Circuit Breaker abre y las respuestas dejan de esperar el timeout. Al levantar el servicio, el sistema se recupera solo.

**1. Parar el servicio y analizar.**

```bash
$C stop llm-analysis
analizar $KP --fail-on none --fail-on-degraded; echo "exit code: $?"
```

```text
Gyde · análisis 4b5e0c91-7e51-438e-bafd-a14e4a760dbf
Estado: ready
⚠ Resultado degradado (el servicio de IA no está disponible): falta la explicación de IA; los hallazgos siguen siendo válidos.
Resumen: 0 crítica, 1 alta, 1 media, 0 baja, 0 info · riesgo 57/100

[ALTA] Acme.Serialization 1.4.0 is affected by SAMPLE-0001 — Acme.Serialization@1.4.0
  …
[MEDIA] Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution — Acme.GplToolkit@2.1.0
  …
exit code: 3
```

**Qué debe verse.** El aviso **«Resultado degradado»**, los **mismos dos hallazgos** y el **mismo riesgo 57**, y el código de salida **3** (solo con `--fail-on-degraded`; sin esa opción un degradado sale con 0 o 1 según los hallazgos: `packages/analysis-engine/src/report/exit-code.ts`).

**2. El Circuit Breaker abre.** Siete análisis seguidos, midiendo cada uno (el estudio Pro, con `llm-analysis` apagado):

```bash
for i in 1 2 3 4 5 6 7; do
  t0=$(date +%s.%N)
  out=$(analizar $KP --format json --fail-on none | sed -n '/^{/,$p' | resumen)
  printf 'run %s: %5.1f s  %s\n' $i $(awk -v a="$(date +%s.%N)" -v b="$t0" 'BEGIN{print a-b}') "$out"
done
```

```text
run 1:   5.4 s  {"status":"ready","degraded":true,"degradedReason":"llm-unavailable","appliedLayers":["basic","license-compliance","severity-score"],"findings":2,"aiExplanation":false}
run 2:   5.8 s  …idéntico…
run 3:   5.8 s  …idéntico…
run 4:   5.8 s  …idéntico…
run 5:   2.2 s  …idéntico…
run 6:   2.2 s  …idéntico…
run 7:   2.3 s  …idéntico…
```

Los primeros análisis tardan unos **5,5 s** cada uno; en cuanto el circuito abre bajan a ~**2,2 s**. La diferencia (~3,5 s) es lo que cuesta intentar llamar a un servicio que ya no contesta; los ~2 s restantes son el arranque de `tsx` y el sondeo del CLI, que no cambian. El log de Retrieval lo confirma: primero `fetch failed` y, una vez abierto, `CircuitOpenError`.

**Cuándo abre depende de la ventana.** La regla (`packages/resilience/src/circuit-breaker.ts`) es: **5 fallos consecutivos** (`CB_FAILURE_THRESHOLD`) **o** una tasa de fallos ≥ 50 % (`CB_FAILURE_RATE`) con al menos 5 llamadas (`CB_MIN_CALLS`) dentro de 30 s (`CB_WINDOW_MS`). En la corrida que se muestra abrió tras 4 lentos y 5 fallos; en otra corrida del mismo día abrió tras solo 2, porque había llamadas fallidas recientes en la ventana. Lo estable es la secuencia **lentos → rápidos**.

```bash
$C logs retrieval --no-log-prefix --since 5m | grep -iE "circuit|fetch failed|llm"
```

```text
{"level":40,"time":"2026-10-12T21:07:33.715Z","service":"retrieval",…,"msg":"dispatch-to-llm failed for 4b5e0c91-…: LlmUnavailableError: llm-analysis is unavailable: llm-analysis is unavailable: TypeError: fetch failed"}
   … (los fallos 2, 3 y 4, cada ~5,5 s, con el mismo mensaje)
{"level":40,"time":"2026-10-12T21:07:56.465Z","service":"retrieval",…,"msg":"dispatch-to-llm failed for c9433d99-…: … TypeError: fetch failed"}   ← 5.º fallo
{"level":40,"time":"2026-10-12T21:07:58.604Z","service":"retrieval",…,"msg":"dispatch-to-llm failed for 82fbd46b-…: … CircuitOpenError: Circuit \"retrieval->llm-analysis\" is open: …"}   ← ya abierto
{"level":40,"time":"2026-10-12T21:08:00.823Z","service":"retrieval",…,"msg":"… CircuitOpenError: Circuit \"retrieval->llm-analysis\" is open: …"}
```

**3. La instancia caída sale del registry** (Health Checker):

```bash
T=$(grep '^INTERNAL_SERVICE_TOKEN=' .env | cut -d= -f2)
curl -s -H "x-internal-token: $T" localhost:4100/v1/services/llm-analysis
```

```text
{"serviceName":"llm-analysis","instances":[]}
```

**4. Recuperación.**

```bash
$C start llm-analysis
esperar_sano llm-analysis
for i in 1 2 3; do echo "$(date -u +%T) try $i: $(analizar $KP --format json --fail-on none | sed -n '/^{/,$p' | resumen)"; sleep 8; done
curl -s -H "x-internal-token: $T" localhost:4100/v1/services/llm-analysis
```

```text
21:08:26 try 1: {"status":"ready","degraded":false,"appliedLayers":["basic","license-compliance","ai-enrichment","severity-score"],"riskScore":57,"findings":2,"aiExplanation":true}
21:08:36 try 2: … igual …
21:08:46 try 3: … igual …
{"serviceName":"llm-analysis","instances":[{"instanceId":"llm-analysis-1","serviceName":"llm-analysis","baseUrl":"http://llm-analysis:4400",…,"healthy":true,…}]}
```

**Qué debe verse.** Tras levantarlo, el siguiente análisis ya **no** sale degradado, vuelve la capa `ai-enrichment`, y la instancia reaparece en el registry. (El circuito vuelve a cerrar tras `CB_OPEN_TIMEOUT_MS`, 15 s por defecto: en esta corrida ya habían pasado más de 15 s desde el último fallo; si lo haces más rápido, el primer intento puede salir aún degradado y el siguiente no.)

**Patrón y archivos.**

| Patrón | Qué se ve | Archivo |
|---|---|---|
| **Circuit Breaker** | Cerrado → abierto tras 5 fallos → semiabierto → cerrado; un breaker por dependencia (aquí `retrieval->llm-analysis`) | `packages/resilience/src/circuit-breaker.ts:65`; envoltorio HTTP en `packages/service-kit/src/resilient-http-client.ts:88` |
| **Service Discovery** | La instancia desaparece del registry unos segundos después de caer y reaparece sola | `services/registry`, `packages/discovery` |
| Degradado, no fallo | Un informe es `degraded` solo si se esperaba IA y no pudo correr (`llm-unavailable`, `llm-not-configured`, `llm-error`) | `services/reports/src/domain/entities/analysis.entity.ts:148` (`Analysis.recordFailure`), `services/reports/src/application/use-cases/record-analysis-failure.use-case.ts:17` |
| Quién avisa | Retrieval publica `llm-unavailable` a Reports si no llega a `llm-analysis` | `services/retrieval/src/application/use-cases/retrieve-evidence.use-case.ts:173` (paso 6 del caso de uso) |

> **Variante del Circuit Breaker en una sola pantalla:** el paso 2 es el «Circuit Breaker abriendo y cerrando» del [paso 4 de la demo](dia-de-integracion.md#6-los-pasos-de-la-demo). Para verlo en los logs mientras se corre, `$C logs -f retrieval | grep -iE "circuit|fetch failed"` en una segunda terminal.

---

## Escena d: `503` con `reports` detenido y recuperación

**Qué se demuestra.** Reports es la pieza central: si cae, el gateway **no se cuelga ni responde un 500**: contesta un `503` controlado, sigue atendiendo lo que no depende de Reports, abre su Circuit Breaker para dejar de esperar, y todo vuelve al levantarlo, incluidos los análisis ya guardados.

**1. Parar Reports y pedir cosas** (`$ID` es el análisis de referencia del apartado 0.3):

```bash
$C stop reports
curl -s -w '\nHTTP %{http_code}  (%{time_total} s)\n' -X POST -H "Authorization: Bearer $KA" -H 'content-type: application/json' $G/v1/analyses -d "$BODY"
curl -s -w '\nHTTP %{http_code}  (%{time_total} s)\n' -H "Authorization: Bearer $KA" $G/v1/analyses/$ID
curl -s -w '\nHTTP %{http_code}  (%{time_total} s)\n' -H "Authorization: Bearer $KA" $G/v1/auth/verify
```

```text
{"error":{"code":"upstream_unavailable","message":"The service is temporarily unavailable","requestId":"b3f482d0-1b76-4ec5-94d3-48cfe7c93b23"}}
HTTP 503  (3.677145 s)

{"error":{"code":"upstream_unavailable","message":"The service is temporarily unavailable","requestId":"26b9e30e-f8d1-4859-95a6-e46c22527b3f"}}
HTTP 503  (3.734820 s)

{"plan":"free","entitlements":{"plan":"free","limits":{"analysesPerMonth":30,"projects":1},"features":{"licenseCompliance":true,"compatibilityAnalysis":false,"severityScoring":true,"aiEnrichment":false}}}
HTTP 200  (0.001540 s)
```

**Qué debe verse.** `503 upstream_unavailable` al crear **y** al leer, con el cuerpo de error estándar (con `requestId`) y **sin** detalles internos. `auth/verify` sigue respondiendo `200` al instante: el gateway está sano; solo falla lo que depende de Reports.

**2. El Circuit Breaker del gateway abre.** Nueve peticiones seguidas, una por segundo:

```bash
t0=$(date +%s)
for i in $(seq 1 9); do
  printf 't+%2ss  ' $(( $(date +%s) - t0 ))
  curl -s -o /dev/null -w 'POST /v1/analyses -> HTTP %{http_code} (%{time_total} s)\n' -X POST -H "Authorization: Bearer $KA" -H 'content-type: application/json' $G/v1/analyses -d "$BODY"
  sleep 1
done
```

```text
t+ 0s  POST /v1/analyses -> HTTP 503 (3.677616 s)
t+ 5s  POST /v1/analyses -> HTTP 503 (3.727175 s)
t+ 9s  POST /v1/analyses -> HTTP 503 (3.723085 s)
t+14s  POST /v1/analyses -> HTTP 503 (3.728669 s)
t+19s  POST /v1/analyses -> HTTP 503 (3.728515 s)
t+24s  POST /v1/analyses -> HTTP 503 (0.002739 s)
t+25s  POST /v1/analyses -> HTTP 503 (0.004647 s)
t+26s  POST /v1/analyses -> HTTP 503 (0.002512 s)
t+27s  POST /v1/analyses -> HTTP 503 (0.002336 s)
```

**Qué debe verse.** Las primeras peticiones fallan tras ~**3,7 s** (es lo que tarda en rendirse una llamada a un servicio que ya no contesta); cuando el circuito abre, el `503` llega en ~**3 ms**: el gateway deja de esperar. En la corrida que se muestra abrió tras cinco lentas; en otra abrió tras tres (misma regla que en la escena c: fallos consecutivos o tasa de fallos en la ventana). El log lo confirma, y el registry ya no lista la instancia:

```bash
$C logs gateway --no-log-prefix --since 2m | grep -o 'reports call failed: [A-Za-z]*' | sort | uniq -c
curl -s -H "x-internal-token: $T" localhost:4100/v1/services/reports
```

```text
      4 reports call failed: CircuitOpenError
      5 reports call failed: TypeError
{"serviceName":"reports","instances":[]}
```

(Cinco fallos reales y cuatro rechazos del circuito en esta corrida; los números cambian con la ventana, la proporción lentos → rechazados no.)

**3. Recuperación.**

```bash
$C start reports
esperar_sano reports
t0=$(date +%s)
for i in $(seq 1 6); do
  printf 't+%2ss  ' $(( $(date +%s) - t0 ))
  curl -s -o /dev/null -w 'POST /v1/analyses -> HTTP %{http_code} (%{time_total} s)\n' -X POST -H "Authorization: Bearer $KA" -H 'content-type: application/json' $G/v1/analyses -d "$BODY"
  sleep 4
done
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KA" $G/v1/analyses/$ID | cut -c1-200
```

```text
t+ 0s  POST /v1/analyses -> HTTP 503 (0.004083 s)     ← el circuito sigue abierto (CB_OPEN_TIMEOUT_MS = 15 s desde el último fallo)
t+ 4s  POST /v1/analyses -> HTTP 202 (0.077413 s)     ← semiabierto: la llamada de prueba pasa y el circuito cierra
t+ 8s  POST /v1/analyses -> HTTP 202 (0.018892 s)
t+12s  POST /v1/analyses -> HTTP 202 (0.015966 s)
t+16s  POST /v1/analyses -> HTTP 202 (0.016925 s)
t+20s  POST /v1/analyses -> HTTP 202 (0.049727 s)
{"id":"7298a36a-376a-490e-8ba7-bc56ff4aa162","status":"ready","createdAt":"2026-10-12T21:01:34.239Z","completedAt":"2026-10-12T21:01:34.516Z","degraded":false,"appliedLayers":["basic","license-complia
HTTP 200
```

**Qué debe verse.** Un `503` inmediato mientras el circuito sigue abierto (aunque Reports ya esté sano), después `202` en cuanto cierra, y el análisis viejo **sigue ahí** (ver también la escena f). Los tiempos exactos varían según cuándo se levante Reports respecto de los 15 s del circuito: lo estable es la secuencia **503 lentos → 503 instantáneos → 202**. Evidencia anterior del mismo comportamiento: `docs/evidence/humo-final-2026-10-12.txt` («with Reports stopped it answers 503 upstream_unavailable instead of hanging»).

**Patrón y archivos.**

| Patrón | Archivo |
|---|---|
| **Circuit Breaker** + **Service Discovery** del gateway hacia Reports | `services/gateway/src/infrastructure/adapters/http-reports-client.adapter.ts` (resuelve la instancia en el registry y llama a través del breaker), `packages/service-kit/src/resilient-http-client.ts:88`, `packages/resilience/src/circuit-breaker.ts:65` |
| El gateway traduce el fallo a un error del contrato (`upstream_unavailable`, `503`) | `services/gateway` |

---

## Escena e: aislamiento entre estudios

**Qué se demuestra.** Un estudio con una API key válida **no puede leer** los análisis de otro, ni siquiera conociendo su id. Y no puede **saber** si ese id existe: la respuesta es idéntica a la de un id inexistente.

```bash
# 1. El estudio A crea un análisis y espera a que termine
ID=$(curl -s -X POST -H "Authorization: Bearer $KA" -H 'content-type: application/json' $G/v1/analyses -d "$BODY" | sed -E 's/.*"analysisId":"([^"]+)".*/\1/')
esperar_ready $KA $ID
echo "analysisId (A) = $ID"

# 2. A lee lo suyo (JSON y Markdown)
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KA" $G/v1/analyses/$ID | cut -c1-400
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KA" $G/v1/analyses/$ID/markdown | sed -n '1,8p;$p'

# 3. B pide el análisis de A
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KB" $G/v1/analyses/$ID
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KB" $G/v1/analyses/$ID/markdown

# 4. Control: B pide un id que no existe
NOPE=00000000-0000-4000-8000-000000000000
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KB" $G/v1/analyses/$NOPE
curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $KB" $G/v1/analyses/$NOPE/markdown
```

```text
analysisId (A) = 7298a36a-376a-490e-8ba7-bc56ff4aa162

{"id":"7298a36a-376a-490e-8ba7-bc56ff4aa162","status":"ready","createdAt":"2026-10-12T21:01:34.239Z","completedAt":"2026-10-12T21:01:34.516Z","degraded":false,"appliedLayers":["basic","license-compliance","severity-score"],"summary":{"counts":{"critical":0,"high":1,"medium":1,"low":0,"info":0},"riskScore":57},"findings":[{"id":"vuln:SAMPLE-0001:nuget:Acme.Serialization@1.4.0","kind":"vulnerability","severity":"high",…
HTTP 200
# Reporte de análisis — `7298a36a-376a-490e-8ba7-bc56ff4aa162`

_Generado el 2026-10-12_

**Estado:** ready · **Riesgo:** 57/100
…
HTTP 200

{"error":{"code":"not_found","message":"Analysis not found","requestId":"6db2e4f3-cae3-4264-a4e3-77a49b281277"}}
HTTP 404

{"error":{"code":"not_found","message":"Analysis not found","requestId":"af142bb7-a080-4548-8316-1eeb55f00616"}}
HTTP 404

{"error":{"code":"not_found","message":"Analysis not found","requestId":"ca0023d6-5100-414a-aa18-f8620e7808aa"}}
HTTP 404

{"error":{"code":"not_found","message":"Analysis not found","requestId":"2c8ab7e2-c33d-44cd-9c55-31a121b900ff"}}
HTTP 404
```

(Las respuestas completas de 2 se acortan aquí con `cut`/`sed`; las de 3 y 4 son completas, tal como se imprimieron.)

**Qué debe verse.** A: `200` (JSON y Markdown). B: `404 not_found` con **el mismo cuerpo** que el id inexistente (cambia solo el `requestId`, único por petición). No hay forma de distinguir «no es tuyo» de «no existe».

**Defensa en profundidad:** el mismo resultado directamente contra Reports (sin gateway), con el token interno y la cabecera `x-gyde-tenant-id` que el gateway propaga:

```bash
T=$(grep '^INTERNAL_SERVICE_TOKEN=' .env | cut -d= -f2)
TA=$($C exec -T postgres psql -U gyde -d gyde -tAc "select id from web.tenants where slug='demo-estudio-a'")
TB=$($C exec -T postgres psql -U gyde -d gyde -tAc "select id from web.tenants where slug='demo-estudio-b'")
curl -s -o /dev/null -w 'tenant A      -> HTTP %{http_code}\n' -H "x-internal-token: $T" -H "x-gyde-tenant-id: $TA" localhost:4500/internal/analyses/$ID
curl -s -o /dev/null -w 'tenant B      -> HTTP %{http_code}\n' -H "x-internal-token: $T" -H "x-gyde-tenant-id: $TB" localhost:4500/internal/analyses/$ID
curl -s -o /dev/null -w 'sin cabecera  -> HTTP %{http_code}\n' -H "x-internal-token: $T" localhost:4500/internal/analyses/$ID
$C exec -T postgres psql -U gyde -d gyde -tAc "select tenant_id, status from reports.analyses where id='$ID'"
```

```text
tenant A      -> HTTP 200
tenant B      -> HTTP 404
sin cabecera  -> HTTP 404
56784f48-92ef-4e3f-8811-f9d2d4a8b1aa|ready          ← el tenant A es el dueño guardado con el análisis
```

**Patrón y archivos.** No es un patrón GoF sino una **regla de capas**: el gateway resuelve el tenant de la API key y lo propaga como cabecera; **el dominio de Reports decide** si el análisis es del que pregunta.

| Qué | Archivo |
|---|---|
| El gateway propaga el tenant resuelto de la API key | `services/gateway/src/infrastructure/adapters/http-reports-client.adapter.ts:66` (`HEADERS.tenantId`) |
| El controlador lee la cabecera y la pasa al caso de uso | `services/reports/src/http/reports.controller.ts` |
| **La decisión**: otro tenant (o ninguno) responde exactamente igual que un id inexistente | `services/reports/src/application/use-cases/get-report.use-case.ts:17` (`GetReportUseCase`, que usa `Analysis.isOwnedBy` de `services/reports/src/domain/entities/analysis.entity.ts:87`) |
| La cabecera es parte del contrato | `packages/contracts/src/routes.ts:53` (`HEADERS.tenantId`) |

---

## Escena f: persistencia tras reiniciar `reports`

**Qué se demuestra.** Los análisis viven en PostgreSQL (schema `reports`), no en la memoria del proceso: reiniciar Reports no pierde nada. Y si Reports muere con un análisis a medias, **el barrido de arranque** lo cierra de forma segura.

### f.1 El mismo id tras `restart reports`

```bash
curl -s -H "Authorization: Bearer $KA" $G/v1/analyses/$ID | resumen
$C restart reports
esperar_sano reports
curl -s -H "Authorization: Bearer $KA" $G/v1/analyses/$ID | resumen
$C logs reports --no-log-prefix --since 1m | grep -E "migrations applied|startup sweep|successfully started" | cut -c1-200
$C exec -T postgres psql -U gyde -d gyde -c "select name from reports.schema_migrations" -c "select status, count(*) from reports.analyses group by status"
```

```text
{"status":"ready","degraded":false,"appliedLayers":["basic","license-compliance","severity-score"],"riskScore":57,"findings":2,"aiExplanation":false}      ← antes
{"status":"ready","degraded":false,"appliedLayers":["basic","license-compliance","severity-score"],"riskScore":57,"findings":2,"aiExplanation":false}      ← después
{"level":30,"time":"2026-10-12T21:01:59.178Z","service":"reports","name":"reports","context":"ReportsStartup","msg":"database migrations applied"}
{"level":30,"time":"2026-10-12T21:01:59.190Z","service":"reports","name":"reports","context":"NestApplication","msg":"Nest application successfully started"}
```

**Qué debe verse.** El análisis es **idéntico** antes y después, y los logs de arranque muestran que Reports **aplica sus migraciones antes de escuchar**. (Sin análisis atascados no hay línea de barrido: solo se registra cuando cierra algo; ver f.2.) Las dos consultas finales muestran la migración `0000_analyses` y la cuenta de análisis por estado.

### f.2 El barrido de arranque (`sweepStaleAnalyses`)

El temporizador de la IA (`REPORTS_AI_TIMEOUT_MS`, 60 s) vive **en memoria**: si Reports muere con un análisis en `analyzing`, nadie lo cerraría. Para provocar justo eso: se **pausa** `llm-analysis` (acepta la conexión pero nunca responde), se crea un análisis Pro con IA, se **mata** Reports mientras espera, se espera más de 60 s y se levanta.

```bash
docker pause gyde-llm-analysis-1                                  # nombre del contenedor con -p gyde
ID2=$(curl -s -X POST -H "Authorization: Bearer $KP" -H 'content-type: application/json' $G/v1/analyses -d "$BODY_AI" | sed -E 's/.*"analysisId":"([^"]+)".*/\1/')
for _ in $(seq 80); do [ "$($C exec -T postgres psql -U gyde -d gyde -tAc "select status from reports.analyses where id='$ID2'")" = analyzing ] && break; sleep 0.25; done
docker kill gyde-reports-1
sleep 75                                                          # más que REPORTS_AI_TIMEOUT_MS (60000 ms)
$C exec -T postgres psql -U gyde -d gyde -tAc "select id, status, now() - created_at as age from reports.analyses where id='$ID2'"
$C start reports
esperar_sano reports
$C logs reports --no-log-prefix --since 3m | grep -E "migrations applied|startup sweep" | cut -c1-220
curl -s -H "Authorization: Bearer $KP" $G/v1/analyses/$ID2 | resumen
docker unpause gyde-llm-analysis-1
```

```text
200df799-13d7-4273-89c6-05880485e7a5|analyzing|00:01:16.051891          ← con Reports caído: sigue en «analyzing», edad 1 min 16 s
{"level":30,"time":"2026-10-12T21:04:19.304Z",…,"context":"ReportsStartup","msg":"database migrations applied"}
{"level":30,"time":"2026-10-12T21:04:19.325Z",…,"context":"ReportsStartup","msg":"startup sweep closed 1 stale analyzing and 0 stale retrieving analyses"}
{"status":"ready","degraded":true,"degradedReason":"llm-unavailable","appliedLayers":["basic","license-compliance","severity-score"],"riskScore":57,"findings":2,"aiExplanation":false}
```

**Qué debe verse.** La línea `startup sweep closed 1 stale analyzing and 0 stale retrieving analyses` **antes** de que Reports empiece a escuchar, y el análisis en `ready` + `degraded` por `llm-unavailable`, con sus dos hallazgos intactos.

**Límite conocido (declarado en el README de Reports):** el barrido solo cierra lo que lleva en `analyzing` más de `REPORTS_AI_TIMEOUT_MS` (o en `retrieving` más de `REPORTS_RETRIEVAL_TIMEOUT_MS`, 90 s). Un análisis más joven cuando Reports se reinicia **no** se cierra en ese arranque: por eso la espera de 75 s antes de levantarlo.

**Patrón y archivos.**

| Qué | Archivo |
|---|---|
| El puerto (la interfaz que ve la aplicación) | `services/reports/src/domain/repositories/report.repository.ts:5` (`ReportRepository`, con `findStale` en `:13`) |
| El adaptador PostgreSQL | `services/reports/src/infrastructure/repositories/postgres-report.repository.ts:15`, `findStale` en `:35` |
| El adaptador en memoria (pruebas) | `services/reports/src/infrastructure/repositories/in-memory-report.repository.ts` |
| Migraciones | `services/reports/drizzle/0000_analyses.sql`, aplicadas en `services/reports/src/infrastructure/reports-startup.ts` |
| El barrido | `services/reports/src/application/use-cases/sweep-stale-analyses.use-case.ts:20` (`SweepStaleAnalysesUseCase`), llamado desde `ReportsStartup.onModuleInit` (`services/reports/src/infrastructure/reports-startup.ts:32`) |

**Clean Architecture en una frase:** los casos de uso de `application/` (`GetReportUseCase`, `SweepStaleAnalysesUseCase`, `RecordAnalysisFailureUseCase`…) dependen de `ReportRepository` (un contrato en `domain/repositories/`); PostgreSQL es un detalle de `infrastructure/` que se inyecta al arrancar. Por eso el mismo código corre con la base de datos o con el almacén en memoria de las pruebas.

---

## Al terminar

```bash
unset KA KB KP
$C down            # conserva la base de datos; $C down -v para empezar de cero
```

Los estudios `demo-*` viven solo en la base local. Si quieres borrarlos sin tirar el resto: `$C exec -T postgres psql -U gyde -d gyde -c "delete from web.users where github_id like 'dev-demo-%'"` (las claves y los estudios se borran en cascada).

## Qué NO cubre este guion

- **Stripe / cambio de plan desde la web:** el Checkout y el Portal existen en `dev` (#73), pero necesitan llaves de prueba de Stripe y los precios configurados (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_STUDIO`); esta demo no los usa y asigna el plan Pro con el `INSERT` del apartado 0.1.
- **Los límites del plan (`402`/`429`):** implementados en el gateway (#70) y con su evidencia en [`docs/evidence/descubrimiento-y-breaker-2026-10-12.txt`](../evidence/descubrimiento-y-breaker-2026-10-12.txt).
- **Un proveedor de IA real:** la demo usa el mock; el real necesita una llave de IA del estudio en la web.
- **La Action de GitHub** contra un gateway local: está probada con un gateway falso (`apps/github-action/test/run.test.ts`).
