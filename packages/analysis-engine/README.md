# @gyde/analysis-engine

Motor del **cliente** (corre en la máquina del usuario o en el runner de CI). Lo usan `apps/cli`, `apps/github-action` y `apps/vscode-extension`. Aquí viven los patrones de diseño **Template Method** y **Abstract Factory** del documento de arquitectura, y la **puerta de privacidad**.

> **Estado:** los patrones, los pasos del pipeline y los dos parsers (C# y C++) están implementados y probados; en este paquete el Área 4 ya no tiene tareas abiertas salvo el `publishResult` de la Action (comentario de PR, **Área 2**). Criterios de aceptación en `test/acceptance.test.ts`.

## Cómo se corresponde con el documento

| Participante del documento | Código |
|---|---|
| `AnalysisPipeline` (AbstractClass, método plantilla `RunAnalysis()`) | `src/pipeline/analysis-pipeline.ts` |
| `LocalCLIPipeline` / `GitHubActionPipeline` (ConcreteClass) | `src/pipeline/local-cli.pipeline.ts`, `github-action.pipeline.ts` |
| `AnalysisToolchainFactory` (AbstractFactory) | `src/toolchain/ports.ts` |
| `UnityToolchainFactory` / `UnrealToolchainFactory` (ConcreteFactory) | `src/toolchain/unity/`, `src/toolchain/unreal/` |
| `DependencyParser` → `CsharpDependencyParser` / `CppDependencyParser` | `src/toolchain/{unity,unreal}/*-dependency-parser.ts` |
| `VulnerabilityFetcher` → `OsvVulnerabilityFetcher` / `NvdVulnerabilityFetcher` | `src/toolchain/{unity,unreal}/*-vulnerability-fetcher.ts` |
| Elegir la fábrica según el motor | `src/toolchain/create-toolchain.ts` |
| Detectar el motor de una carpeta (`detectGameEngine`) | `src/toolchain/detect-game-engine.ts` |

La familia es **Unity → parser C# + OSV** y **Unreal → parser C++ (`Build.cs`) + NVD**, como en el UML del PDF.

## Template Method: el orden es ley

```
authenticateKey ─ parseDependencies (hook) ─ submitAnalysis ─ fetchVulnerabilities
   ─ analyzeLicenses ─ generateReport ─ publishResult (hook)
```

Son siete métodos: los **cinco pasos del documento** (autenticar, parsear, vulnerabilidades, licencias y reporte) más `submitAnalysis` (el envío de la solicitud única, ADR 0004) y `publishResult`.

- Un test de arquitectura exige que ningún pipeline concreto sobrescriba `runAnalysis()`.
- Autenticar, parsear y publicar son **locales**. `fetchVulnerabilities`, `analyzeLicenses` y `generateReport` son **etapas del mismo trabajo remoto** (`retrieving` → `analyzing` → `ready`): el backend orquesta (ver `docs/adr/`).
- `VulnerabilityFetcher` **no consulta NVD/OSV directamente**: lee la etapa de vulnerabilidades del análisis a través del gateway.

## Privacidad

`buildAnalysisRequest()` es la **única** forma de construir lo que sale del entorno del cliente: copia una lista explícita de campos y valida contra el esquema estricto de `@gyde/contracts`. Aunque un parser adjunte una ruta o un fragmento de código por error, no sale. No la rodees.

## Esperar al backend: `waitForReport`

`fetchVulnerabilities`, `analyzeLicenses` y `generateReport` son etapas del mismo trabajo remoto, así que comparten un helper (`src/pipeline/wait-for-report.ts`) que sondea `gateway.getReport`:

| Etapa | Espera hasta | Devuelve |
|---|---|---|
| `fetchVulnerabilities` (OSV / NVD) | `analyzing` o `ready` | hallazgos `vulnerability` con evidencia de su fuente (`osv` / `nvd`; basta una evidencia de esa fuente) |
| `analyzeLicenses` | `analyzing` o `ready` | hallazgos `license` |
| `generateReport` | `ready` | el `Report` completo |

- `pollIntervalMs` (500), `timeoutMs` (60 000) y `sleep` son inyectables (`AnalysisPipelineDeps.wait`, `ToolchainOptions.wait`); las pruebas no usan temporizadores reales.
- Si el análisis termina `failed` o se agota el tiempo, lanza `AnalysisWaitError` (`reason: "failed" | "timeout"`) con el mensaje del reporte. Si el gateway no responde, `GydeApiClient` sirve el último reporte en caché marcado `degraded`.
- La última respuesta se guarda por trabajo (`WeakMap`), de modo que las tres etapas de una ejecución hacen una sola consulta si la primera ya basta.
- `AnalysisGateway.getMarkdown(id)` (`GET /v1/analyses/:id/markdown`) trae el Markdown que renderiza Reports; el cliente no lo reimplementa.

## Salida del CLI

`LocalCLIPipeline.publishResult` imprime `formatReportText(report)` por el `output` inyectado (sin `output`, no imprime; nunca usa `console.log`): resumen por severidad, aviso de degradado y hallazgos ordenados por severidad con evidencia, impacto y recomendación. El pipeline **no toca `process`**: el código de salida lo calcula quien lo llama con `exitCodeForReport(report, failOn)` (1 si hay hallazgos de `failOn` o peor; el 2 y el 3 son del CLI).

## Tareas del Área 4 en este paquete

1. ~~`CsharpDependencyParser`~~ (hecho: UPM, NuGet con licencia `.nuspec`, versión del editor) · ~~`detectGameEngine`~~ (hecho, ver abajo) · ~~`CppDependencyParser`~~ (hecho: plugins y módulos del `.uproject`/`.Build.cs`, `vcpkg.json` y `conanfile.txt`, dedupe y orden determinista; resultado exacto en `fixtures/projects/unreal-sample/expected-parse.json`).
2. ~~`GydeApiClient`~~ (hecho: `Authorization: Bearer`, validación de respuestas con `@gyde/contracts`, Circuit Breaker, caché local que sirve el último reporte como degradado, `GydeApiError` accionable para 401/402/429, `getMarkdown`; nunca registra la API key).
3. ~~`fetchVulnerabilities`, `analyzeLicenses`, `generateReport`~~ (hecho: `waitForReport`). El `NvdVulnerabilityFetcher` usa el mismo filtro con la fuente `nvd`.
4. ~~`parseDependencies` de los dos pipelines y `publishResult` del CLI~~ (hecho, con `includeAi`). El `publishResult` de la **Action** (comentario de PR) es del **Área 2**.

## Detectar el motor

`detectGameEngine(projectRoot)` mira solo marcadores, nunca el código:

| Motor | Marcador |
|---|---|
| Unity | `ProjectSettings/ProjectVersion.txt` **o** `Packages/manifest.json` (basta uno) |
| Unreal | un archivo `*.uproject` en la raíz |

Falla con `GameEngineDetectionError` (mensaje en español, listo para mostrar y sin *stack trace*): `reason: "not-found"` si la carpeta no existe, `"not-detected"` si no hay marcadores (el mensaje dice qué se buscó) y `"ambiguous"` si coinciden los dos motores (sugiere `--engine unity|unreal`, opción que implementa el CLI).
