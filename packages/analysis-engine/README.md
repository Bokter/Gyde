# @gyde/analysis-engine

Motor del **cliente** (corre en la máquina del usuario o en el runner de CI). Lo usan `apps/cli`, `apps/github-action` y `apps/vscode-extension`. Aquí viven los patrones de diseño **Template Method** y **Abstract Factory** del documento de arquitectura, y la **puerta de privacidad**.

> **Estado:** la *estructura* de los patrones está implementada y probada; la lógica pesada es del **Área 4** (`docs/tasks/area-4-motor-llm-y-reportes.md`). Los criterios de aceptación pendientes están en `test/acceptance.test.ts`.

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

La familia es **Unity → parser C# + OSV** y **Unreal → parser C++ (`Build.cs`) + NVD**, como en el UML del PDF.

## Template Method: el orden es ley

```
1 authenticateKey ─ 2 parseDependencies (hook) ─ submitAnalysis ─ 3 fetchVulnerabilities
   ─ 4 analyzeLicenses ─ 5 generateReport ─ 6 publishResult (hook)
```

- Un test de arquitectura exige que ningún pipeline concreto sobrescriba `runAnalysis()`.
- Autenticar, parsear y publicar son **locales**. Los pasos 3 a 5 son **etapas del mismo trabajo remoto** (`retrieving` → `analyzing` → `ready`): el backend orquesta (ver `docs/adr/`).
- `VulnerabilityFetcher` **no consulta NVD/OSV directamente**: lee la etapa de vulnerabilidades del análisis a través del gateway.

## Privacidad

`buildAnalysisRequest()` es la **única** forma de construir lo que sale del entorno del cliente: copia una lista explícita de campos y valida contra el esquema estricto de `@gyde/contracts`. Aunque un parser adjunte una ruta o un fragmento de código por error, no sale. No la rodees.

## Tareas del Área 4 en este paquete

1. `CsharpDependencyParser` y `CppDependencyParser` contra `fixtures/projects/*`; `detectGameEngine`.
2. `GydeApiClient` (Bearer, validación de respuestas, Circuit Breaker, caché local).
3. `analyzeLicenses`, `generateReport` (polling con tiempo límite, resultado degradado).
4. Las dos implementaciones de `publishResult` (consola y comentario de PR) y `parseDependencies` de cada pipeline.
