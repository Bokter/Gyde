# cli: `gyde`

Línea de comandos que **analiza un proyecto de videojuego en la máquina del usuario** y consulta la API de Gyde. Es una cáscara delgada sobre `@gyde/analysis-engine` (`LocalCLIPipeline`): argumentos, salida en consola y código de salida.

> **Estado:** `gyde analyze` está implementado: detecta el motor, envía **una** petición al gateway y imprime el informe. Verificado contra un gateway falso; la prueba de punta a punta con el gateway real queda para cuando el Área 1 lo entregue.

**Privacidad:** el CLI lee los archivos del proyecto **localmente**; al backend solo viajan nombres, versiones y licencias de dependencias (`buildAnalysisRequest`). Nunca código fuente.

## Uso

```bash
gyde analyze [ruta]  [--api-url <url>] [--api-key <key>] [--engine unity|unreal]
                     [--fail-on critical|high|medium|low|none]
                     [--format text|json|markdown] [--no-ai] [--fail-on-degraded]
                     [--timeout <segundos>]
```

`ruta` por defecto es la carpeta actual. El motor se detecta por sus marcadores (`detectGameEngine`); con `--engine` se fuerza (necesario si la carpeta parece de los dos).

| Opción / variable | Descripción |
|---|---|
| `--api-url` / `GYDE_API_URL` | Gateway de Gyde. Por defecto `http://localhost:4000` |
| `--api-key` / `GYDE_API_KEY` | API key. Prefiere la variable: el argumento queda en el historial del shell. **Nunca se imprime**: si el servidor la devolviera en un mensaje, se sustituye por `***` |
| `--fail-on` | Severidad mínima que hace fallar (`high` por defecto; `none` nunca falla por hallazgos) |
| `--format` | `text` (informe legible, por defecto), `json` (el `Report`) o `markdown` (el Markdown que renderiza Reports, pedido al gateway con `getMarkdown`) |
| `--no-ai` | No pide la explicación de IA (`includeAi: false`) |
| `--fail-on-degraded` | Sale con 3 si el informe es degradado (ver abajo) |
| `--timeout` | Espera máxima del análisis, en segundos. Por defecto 120, por encima de los temporizadores de Reports (60 s para la IA y 90 s para Retrieval) |

Todo texto que viene del backend (informe, Markdown, mensajes de error) se imprime sin caracteres de control, para que un aviso externo no pueda reescribir tu terminal. Los errores salen por `stderr`, legibles y sin _stack trace_.

## Códigos de salida

| Código | Significado                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Análisis correcto y sin hallazgos de la severidad de `--fail-on` o superior                                                                                                                       |
| 1      | Hay hallazgos de la severidad de `--fail-on` o superior                                                                                                                                           |
| 2      | Uso incorrecto (argumentos, falta la API key, carpeta o motor no reconocidos) o error al hablar con el gateway (clave rechazada, plan, red, tiempo agotado, análisis fallido)                      |
| 3      | Resultado **degradado** (p. ej. sin IA) y solo con `--fail-on-degraded`                                                                                                                           |

**Precedencia:** si hay hallazgos graves y el resultado es degradado, gana el **1**. El 3 solo aparece cuando, por los hallazgos, habría salido 0. Sin `--fail-on-degraded`, un degradado sale con 0 o 1 según los hallazgos (el informe de texto lo avisa en la cabecera).

## Estructura

```
src/main.ts    punto de entrada: llama a run() y fija process.exitCode
src/run.ts     el comando completo (testeable: no se ejecuta al importarse)
src/args.ts    lectura y validación de argumentos y variables de entorno
test/          pruebas contra un gateway HTTP falso
```

## Desarrollo

```bash
pnpm --filter @gyde/cli dev -- analyze fixtures/projects/unity-sample
pnpm --filter @gyde/cli build      # genera dist/main.js (un solo archivo)
```
