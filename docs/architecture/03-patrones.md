# Patrones

Dos patrones arquitectónicos y tres de diseño (GoF), tal como los define el documento de arquitectura, más el uso interno de Template Method que el propio documento pide para los analizadores. Cada uno tiene su estructura implementada o esqueletada y **una prueba que lo protege**.

| Patrón | Tipo | Dónde vive | Prueba que lo protege |
|---|---|---|---|
| Circuit Breaker | Arquitectónico | `packages/resilience` | `test/circuit-breaker.test.ts` (criterios pendientes de la tabla 3.3) |
| Service Discovery | Arquitectónico | `services/registry`, `packages/discovery` | `test/registry-client.test.ts` y `services/registry/test/app.test.ts` |
| Abstract Factory | Diseño (creacional) | `packages/analysis-engine/src/toolchain/` | `test/toolchain.test.ts` |
| Template Method (pipeline) | Diseño (comportamiento) | `packages/analysis-engine/src/pipeline/` | `test/analysis-pipeline.test.ts` |
| Template Method (analizadores) | Diseño (comportamiento) | `services/retrieval/src/domain/analyzers/` | `test/base-analyzer.test.ts` |
| Decorator | Diseño (estructural) | `services/reports/src/domain/report/` | `test/report-decorator.test.ts` |

## Circuit Breaker

**Intención en Gyde.** El sistema depende de servicios que no controla (fuentes de vulnerabilidades, proveedores de IA, repositorios de licencias) que pueden volverse lentos o caer por rate limiting o saturación. Sin protección, cada ejecución del CI de un cliente acumularía timeouts y reintentos, y el problema se propagaría a todos los usuarios. El breaker detecta fallos repetidos, "abre el circuito" y responde con un fallback mientras el proveedor se recupera.

**Participantes.** Cliente · `CircuitBreaker` (envuelve cada llamada saliente y decide si permite, bloquea o prueba) · caché local / fallback (`FallbackCache`) · instancia del servicio.

**Reglas.** Estados cerrado / abierto / semiabierto con los umbrales de `.env.example` (`CB_*`). Un breaker por dependencia y, en las llamadas a IA, **por tenant + proveedor**. Tabla completa de decisiones en [02 Flujos](02-flujos.md#3-circuit-breaker).

## Service Discovery

**Intención en Gyde.** Con el modelo freemium la carga es variable y el backend escala instancias de los servicios; sus direcciones cambian, así que no pueden estar fijas en nadie. Un registro dinámico mantiene las instancias activas y saludables.

**Participantes.** Service Registry (`services/registry`) · Health Checker (dentro del registry) · instancias de los servicios (se registran con `@gyde/discovery`) · quien consulta (el **Gateway**).

> **Decisión:** el que consulta el registry es el Gateway, no el cliente; ver [ADR 0005](../adr/0005-discovery-en-el-gateway-y-registry-como-servicio.md).

## Abstract Factory

**Intención en Gyde.** Crear la **familia** de herramientas de análisis que corresponde al motor del proyecto, sin condicionales rígidos (`if engine == "Unity"`) y sin mezclar herramientas incompatibles. Agregar un motor nuevo (Godot) es agregar una fábrica.

| Participante (UML del documento) | Código |
|---|---|
| `AnalysisToolchainFactory` (AbstractFactory) | `toolchain/ports.ts` |
| `UnityToolchainFactory` / `UnrealToolchainFactory` (ConcreteFactory) | `toolchain/unity/`, `toolchain/unreal/` |
| `DependencyParser` (AbstractProduct) → `CsharpDependencyParser` / `CppDependencyParser` | `*-dependency-parser.ts` |
| `VulnerabilityFetcher` (AbstractProduct) → `OsvVulnerabilityFetcher` / `NvdVulnerabilityFetcher` | `*-vulnerability-fetcher.ts` |
| `AnalysisPipeline` (Client) | `pipeline/analysis-pipeline.ts` |

**Familias:** Unity → parser C# + OSV · Unreal → parser C++ (`Build.cs`) + NVD, como en el UML. **Consecuencia aceptada** (la del documento): agregar un producto nuevo a la familia obliga a modificar la interfaz y todas las fábricas. Por eso los **licencias** no son parte de la familia: el análisis SPDX no depende del motor.

## Template Method

**En el pipeline del cliente.** `AnalysisPipeline.runAnalysis()` fija el orden: autenticar, parsear (hook), enviar, vulnerabilidades, licencias, reporte y publicar (hook). `LocalCLIPipeline` y `GitHubActionPipeline` solo rellenan los hooks. Nadie puede alterar el orden ni omitir la validación de la API key; un test de arquitectura exige que ninguna subclase sobrescriba `runAnalysis`.

**En Retrieval, internamente** ("aplicando Template Method internamente", como dice el documento). `BaseAnalyzer.analyze()` = `select → match → toFinding → prioritize → evidencia`, con `prioritize` invariante. Los tres analizadores (vulnerabilidades, licencias, compatibilidad) viven como módulos de un mismo servicio y comparten ese esqueleto. Es **puro y síncrono**: misma entrada, misma salida.

**Consecuencia aceptada:** el esqueleto queda fijo; si un escaneo nuevo necesitara saltarse pasos dinámicamente, la herencia se vuelve difícil de mantener.

## Decorator

**Intención en Gyde.** El reporte base (hallazgos determinísticos) se enriquece con capas según el plan de la API key, sin explosión de clases (`AIReport`, `LicenseReport`, `AILicenseSeverityReport`…).

| Participante (UML) | Código |
|---|---|
| `ReportComponent` | `report-component.ts` |
| `BasicAnalysisReport` (ConcreteComponent) | `basic-analysis-report.ts` |
| `ReportDecorator` | `report-decorator.ts` |
| `AIEnrichmentDecorator`, `LicenseComplianceDecorator`, `SeverityScoreDecorator` | `decorators/*.decorator.ts` |
| Composición según permisos | `compose-report.ts` |

**Reglas.** Los decoradores devuelven objetos nuevos (no mutan lo envuelto). El de severidad va **último** para que su puntaje cubra las capas anteriores. `AiEnrichmentDecorator` solo **mezcla** el `AiResult` que produjo llm-analysis.

> **Decisión:** el Decorator vive en Reports y no en el cliente: necesita el resultado del LLM, los datos de licencias y los permisos de la API key; ver [ADR 0006](../adr/0006-donde-viven-los-patrones-de-diseno.md).

**Consecuencias aceptadas:** un reporte decorado no es idéntico a la instancia base (no compares identidad de objeto) y la cadena de envoltorios puede complicar la depuración si no se traza.
