# cli: `gyde`

Línea de comandos que **analiza un proyecto de videojuego en la máquina del usuario** y consulta la API de Gyde. Es una cáscara delgada sobre `@gyde/analysis-engine` (`LocalCLIPipeline`): argumentos, salida en consola y código de salida.

> **Estado:** esqueleto (`gyde` imprime que no está implementado y sale con código 2). Implementación: **Área 4** (`docs/tasks/area-4-motor-llm-y-reportes.md`).

**Privacidad:** el CLI lee los archivos del proyecto **localmente**; al backend solo viajan nombres, versiones y licencias de dependencias (`buildAnalysisRequest`). Nunca código fuente.

## Uso propuesto

```bash
gyde analyze [ruta]  [--api-url <url>] [--api-key <key>]
                     [--fail-on critical|high|medium|low|none]
                     [--format text|json|markdown] [--no-ai]
```

| Variable | Equivale a |
|---|---|
| `GYDE_API_URL` | `--api-url` (por defecto `http://localhost:4000`) |
| `GYDE_API_KEY` | `--api-key` (preferible a pasarla como argumento: no queda en el historial del shell) |

## Códigos de salida (propuesta)

| Código | Significado |
|---|---|
| 0 | Análisis correcto y sin hallazgos de la severidad de `--fail-on` o superior |
| 1 | Hay hallazgos de la severidad de `--fail-on` o superior |
| 2 | Uso incorrecto, configuración o error inesperado |
| 3 | Resultado **degradado** (p. ej. sin IA); solo falla el CI si se pide con `--fail-on-degraded` |

## Estructura sugerida

```
src/main.ts        punto de entrada (hoy un stub)
src/args.ts        lectura de argumentos y variables de entorno
src/output.ts      formato text / json / markdown
```

## Desarrollo

```bash
pnpm --filter @gyde/cli dev -- analyze fixtures/projects/unity-sample
pnpm --filter @gyde/cli build      # genera dist/main.js (un solo archivo)
```
