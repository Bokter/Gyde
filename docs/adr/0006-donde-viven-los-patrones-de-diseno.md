# 0006. Dónde viven los patrones de diseño

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

El documento describe tres patrones GoF y menciona el "CLI y el motor de análisis" y, a la vez, un "Servicio de Análisis" determinístico que no es un contenedor del diagrama. Hay que decidir en qué código vive cada uno.

## Decisión

| Patrón | Dónde | Motivo |
|---|---|---|
| **Abstract Factory** | `packages/analysis-engine` (cliente) | El parseo de dependencias es local por privacidad; el UML lo sitúa en el CLI |
| **Template Method** (pipeline) | `packages/analysis-engine` (cliente) | Es el flujo del CLI y de la Action: orden estricto y autenticación obligatoria |
| **Template Method** (analizadores) | `services/retrieval` (`BaseAnalyzer`) | El documento: "pueden vivir como módulos dentro de un mismo Servicio de Análisis, aplicando Template Method internamente" |
| **Decorator** | `services/reports` | Necesita el resultado del LLM, los datos de licencias y los permisos de la API key (UML: `llmProviderApi`, `licenseDbUrl`); el cliente solo renderiza |

Detalles:

- Los tres analizadores determinísticos (vulnerabilidades, compatibilidad, licencias) son **módulos de Retrieval**, no tres microservicios ni un servicio aparte.
- La familia del Abstract Factory tiene **dos productos** (`DependencyParser` y `VulnerabilityFetcher`), como el UML. El texto menciona un tercero (formateador de reportes de compatibilidad): lo absorbe Reportes.
- Los **licencias no son parte de la familia**: el análisis SPDX no depende del motor, y el propio documento reconoce que añadir un producto a la familia obliga a tocar todas las fábricas.
- Familias: **Unity → parser C# + OSV**, **Unreal → parser C++ (`Build.cs`) + NVD**.

## Consecuencias

- Cada patrón tiene su ubicación, su prueba y su responsable (ver [03 Patrones](../architecture/03-patrones.md)).
- El cliente no necesita llaves de IA: toda la inteligencia vive en el backend.

## Alternativas descartadas

- **Decorator en el cliente:** el texto lo sugiere, pero el cliente tendría que llamar al LLM y a la base de licencias, contradiciendo que las llaves se administran en el Servicio Web.
- **Un microservicio de análisis determinístico separado:** más fiel a la literalidad del texto, pero más servicios que coordinar en 5 días y no está en el diagrama de contenedores.
