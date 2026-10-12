# Modelo C4

La arquitectura de Gyde en los tres primeros niveles del [modelo C4](https://c4model.com), más las vistas dinámicas (los flujos). Cada elemento nombra el **archivo del código** donde vive, para que el documento y el código se puedan contrastar. Convenciones: caja = elemento propio; óvalo = sistema o persona externos; flecha continua = llamada síncrona; punteada = relación externa o de infraestructura.

| Nivel | Responde | Dónde |
|---|---|---|
| 1. Contexto | ¿Quién usa Gyde y con qué sistemas habla? | Esta página |
| 2. Contenedores | ¿Qué procesos se despliegan y cómo se hablan? | Esta página y [01 Contenedores](01-contenedores.md) |
| 3. Componentes | ¿Cómo está hecho por dentro cada contenedor clave? | Esta página |
| Dinámico | ¿Qué pasa en el tiempo (feliz, degradado, fallo)? | [02 Flujos](02-flujos.md) |

## Nivel 1: contexto

```mermaid
flowchart LR
    dev(["Desarrollador de un estudio<br/>de videojuegos"])
    gyde["<b>Gyde</b><br/>Detecta vulnerabilidades, conflictos de<br/>licencia y riesgos en proyectos<br/>Unity y Unreal"]
    github(["GitHub<br/>inicio de sesión (OAuth)<br/>y Actions"])
    stripe(["Stripe<br/>suscripciones (modo test)"])
    fuentes(["Fuentes públicas<br/>OSV (MVP) · NVD · GHSA"])
    ia(["Proveedor de IA<br/>Anthropic, con la llave<br/>del propio estudio (BYOK)"])

    dev -->|"CLI / Action / extensión<br/>(solo nombres, versiones y licencias)"| gyde
    dev -->|"panel web: llaves, plan, facturación"| gyde
    gyde -->|"autentica"| github
    gyde <-->|"checkout, portal, webhook"| stripe
    gyde -.->|"ingiere avisos"| fuentes
    gyde -.->|"explica hallazgos"| ia
```

Frontera de privacidad: el **código fuente del cliente nunca cruza** la flecha hacia Gyde ([04 Datos, privacidad y seguridad](04-datos-privacidad-seguridad.md)).

## Nivel 2: contenedores

```mermaid
flowchart TB
    subgraph cliente["Entorno del cliente"]
        cli["<b>CLI</b><br/>apps/cli · TypeScript"]
        action["<b>GitHub Action</b><br/>apps/github-action"]
        vsc["<b>Extensión VS Code</b><br/>apps/vscode-extension (esqueleto)"]
        engine["<b>analysis-engine</b><br/>packages/analysis-engine<br/>Template Method + Abstract Factory"]
    end
    subgraph backend["Backend Gyde (Docker Compose, un contenedor por servicio)"]
        gw["<b>gateway</b> :4000<br/>NestJS · API pública /v1"]
        web["<b>web</b> :3000<br/>Next.js · UI, Stripe, API keys, BYOK"]
        rep["<b>reports</b> :4500<br/>NestJS · orquesta y compone el reporte"]
        ret["<b>retrieval</b> :4300<br/>NestJS · análisis determinístico"]
        norm["<b>normalization</b> :4200<br/>NestJS · conocimiento normalizado"]
        llm["<b>llm-analysis</b> :4400<br/>NestJS · IA con llave del estudio"]
        reg["<b>registry</b> :4100<br/>NestJS · Service Registry + Health Checker"]
        pg[("<b>PostgreSQL</b> :5432<br/>un schema y un rol por servicio:<br/>web · normalization · reports")]
    end
    stripe(["Stripe"])
    fuentes(["OSV"])
    ia(["Anthropic"])

    cli --> engine
    action --> engine
    vsc --> engine
    engine -->|"HTTPS/JSON + API key"| gw
    gw -->|"verify de la API key"| web
    gw -->|"crea y lee análisis"| rep
    rep -->|"pide evidencia"| ret
    ret -->|"consulta conocimiento"| norm
    ret -->|"evidencia para IA (si el plan lo permite)"| llm
    ret -->|"resultado determinístico"| rep
    llm -->|"resultado de IA o motivo del fallo"| rep
    llm -->|"llave BYOK del tenant"| web
    web <-->|"checkout y webhook"| stripe
    norm -.->|"ingesta"| fuentes
    llm -.->|"inferencia"| ia
    web --- pg
    norm --- pg
    rep --- pg
    gw -.->|"resuelve instancias"| reg
    rep -.-> reg
    ret -.-> reg
    llm -.-> reg
```

Detalles que el diagrama resume:
- Las llamadas entre servicios usan `ResilientHttpClient` (`packages/service-kit`): **descubren la instancia en el registry** (con `*_URL` como respaldo de desarrollo) y van **detrás de un Circuit Breaker**.
- `/internal/*` exige `x-internal-token` y el gateway **nunca** lo enruta.
- Reports hoy guarda los análisis en memoria (`InMemoryReportRepository`); el adaptador PostgreSQL es el cambio de un solo adaptador gracias al puerto `ReportRepository`.

## Nivel 3: componentes

### gateway: Clean Architecture visible

```mermaid
flowchart LR
    subgraph http["http (controladores)"]
        ctrl["GatewayController"]
        guard["ApiKeyGuard"]
    end
    subgraph app["application (casos de uso y puertos)"]
        auth["AuthenticateApiKey"]
        submit["SubmitAnalysis"]
        get["GetReport"]
        rate["EnforceRateLimit"]
        pv["«puerto» ApiKeyVerifier"]
        pc["«puerto» AuthCache"]
        ph["«puerto» KeyHasher"]
        pr["«puerto» ReportsClient"]
        pl["«puerto» RateLimiter · UsageCounter"]
    end
    subgraph infra["infrastructure (adaptadores)"]
        wv["WebApiKeyVerifier"]
        mc["MemoryAuthCache"]
        sh["Sha256KeyHasher"]
        hr["HttpReportsClient"]
        ml["MemoryRateLimiter · MemoryUsageCounter"]
    end
    guard --> auth
    ctrl --> submit & get
    guard --> rate
    auth --> pv & pc & ph
    submit --> pr
    get --> pr
    rate --> pl
    wv -. implementa .-> pv
    mc -. implementa .-> pc
    sh -. implementa .-> ph
    hr -. implementa .-> pr
    ml -. implementa .-> pl
```

Archivos en `services/gateway/src/{http,application,infrastructure}`. La caché de verify se indexa por **SHA-256 de la clave**, nunca por la clave. Los contadores del plan y de tasa están en memoria (se pierden al reiniciar): limitación asumida del MVP.

### reports: patrón Decorator

```mermaid
flowchart TB
    subgraph app["application"]
        life["AnalysisLifecycle<br/>pending → retrieving → analyzing → ready | failed<br/>(con temporizadores de espera)"]
        rp["«puerto» ReportRepository"]
        rt["«puerto» RetrievalClient"]
    end
    subgraph dom["domain/report (Decorator)"]
        comp["«interfaz» ReportComponent"]
        basic["BasicAnalysisReport<br/>(ConcreteComponent)"]
        dec["ReportDecorator"]
        lic["LicenseComplianceDecorator"]
        ai["AiEnrichmentDecorator"]
        sev["SeverityScoreDecorator"]
        cr["composeReport()<br/>arma la cadena según los Entitlements"]
    end
    subgraph infra["infrastructure"]
        mem["InMemoryReportRepository"]
        hret["HttpRetrievalClient"]
    end
    life --> rp & rt
    life --> cr
    cr --> basic
    basic -. es un .-> comp
    dec -. es un .-> comp
    lic -. extiende .-> dec
    ai -. extiende .-> dec
    sev -. extiende .-> dec
    mem -. implementa .-> rp
    hret -. implementa .-> rt
```

Cadena en tiempo de ejecución (`services/reports/src/domain/report/compose-report.ts`): `Basic → LicenseCompliance → AiEnrichment (solo si el plan lo incluye y llegó el resultado de IA) → SeverityScore` (siempre último). El plan `free` nunca lleva IA; con IA caída el reporte sale **degradado** pero con los mismos hallazgos.

### retrieval: patrón Template Method

```mermaid
flowchart TB
    use["RetrieveEvidence (application)<br/>orquesta analizadores, publica a Reports<br/>y, si el plan lo permite, a llm-analysis"]
    base["«abstracta» BaseAnalyzer&lt;C, M&gt;<br/>analyze() fija el orden:<br/>select → match → toFinding → prioritize"]
    v["VulnerabilityAnalyzer<br/>dependencia + versión contra rangos afectados"]
    l["LicenseAnalyzer<br/>compatibilidad SPDX (license-policy)"]
    c["CompatibilityAnalyzer<br/>(esqueleto: fuera del camino mínimo)"]
    ks["«puerto» KnowledgeSource"]
    hk["HttpKnowledgeSource"]
    use --> base
    v -. extiende .-> base
    l -. extiende .-> base
    c -. extiende .-> base
    use --> ks
    hk -. implementa .-> ks
```

`services/retrieval/src/domain/analyzers/`. Las subclases rellenan los pasos variables (`select`, `match`, `toFinding`); el esqueleto y la priorización están en la clase base.

### analysis-engine (cliente): Template Method y Abstract Factory

```mermaid
flowchart TB
    subgraph tm["Template Method: pipeline"]
        ap["«abstracta» AnalysisPipeline<br/>runAnalysis(): autenticar → parsear → enviar →<br/>vulnerabilidades → licencias → reporte → publicar"]
        cliP["LocalCLIPipeline<br/>parseDependencies · publishResult (consola)"]
        gha["GitHubActionPipeline<br/>(esqueleto)"]
    end
    subgraph af["Abstract Factory: toolchain"]
        f["«interfaz» AnalysisToolchainFactory"]
        uf["UnityToolchainFactory"]
        rf["UnrealToolchainFactory"]
        dp["DependencyParser<br/>CsharpDependencyParser · CppDependencyParser"]
        vf["VulnerabilityFetcher<br/>OsvVulnerabilityFetcher · NvdVulnerabilityFetcher"]
    end
    priv["buildAnalysisRequest<br/>puerta de privacidad estricta"]
    api["GydeApiClient<br/>(con Circuit Breaker y caché de respaldo)"]
    det["detectGameEngine + createToolchainFactory<br/>eligen la fábrica según el proyecto"]
    cliP -. extiende .-> ap
    gha -. extiende .-> ap
    ap --> f
    uf -. implementa .-> f
    rf -. implementa .-> f
    f --> dp & vf
    ap --> priv
    ap --> api
    det --> uf & rf
```

`packages/analysis-engine/src/{pipeline,toolchain,privacy,client}`. Una familia (Unity: C# + OSV) o la otra (Unreal: C++ + NVD) se elige según el proyecto; el pipeline solo conoce las interfaces.

### Transversal: Circuit Breaker y Service Discovery

```mermaid
flowchart LR
    rhc["ResilientHttpClient<br/>packages/service-kit"]
    cb["CircuitBreaker + FallbackCache<br/>packages/resilience"]
    rc["RegistryClient · startRegistration<br/>packages/discovery"]
    subgraph reg["services/registry"]
        ru["RegisterInstance · HeartbeatInstance<br/>DeregisterInstance · ResolveServiceInstances"]
        repo["InMemoryRegistryRepository"]
        hc["HealthChecker"]
    end
    rhc --> cb
    rhc --> rc
    rc -->|"registro, latido, resolución"| ru
    ru --> repo
    hc -->|"/healthz de cada instancia"| repo
```

Cada servicio se registra al arrancar (`startService`) y envía latidos; el Health Checker elimina instancias que no responden. Quien llama resuelve la instancia, pasa por el breaker (por dependencia; en llm-analysis, por **tenant + proveedor**) y, si no hay instancia sana, responde `503 upstream_unavailable` sin quedarse colgado.

## Coherencia con el código y alcance honesto

| Afirmación del documento | Evidencia |
|---|---|
| Cadena Decorator y plan `free` sin IA | `compose-report.ts`; ejecución real en [`docs/evidence/humo-2026-10-12.txt`](../evidence/humo-2026-10-12.txt) (capas `basic, license-compliance, ai-enrichment, severity-score`) |
| Degradado sin caída del análisis | Mismo archivo: caso 3, `degraded=true`, `llm-unavailable`, mismos hallazgos |
| Circuit Breaker + Discovery | Mismo archivo: con Reports detenido el gateway responde `503` y se recupera |
| `/internal/*` no se enruta | Mismo archivo: respuesta `404` |
| Layering impuesto | `tooling/eslint/layer-boundaries.mjs` (`pnpm lint` falla si `domain`/`application` importan infraestructura o NestJS) |

Fuera del MVP o en esqueleto, declarado: `CompatibilityAnalyzer`, `GitHubActionPipeline`, extensión de VS Code, fuentes NVD y GHSA, persistencia de Reports en PostgreSQL (hoy en memoria), contadores de plan y tasa persistentes.
