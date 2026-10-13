# github-action: Gyde Security Scan

GitHub Action que corre el análisis **dentro del runner del cliente** (pipeline de CI/CD) y publica el reporte como comentario del pull request. Es una cáscara sobre `@gyde/analysis-engine`: rellena el *hook* `publishResult` de `GitHubActionPipeline`.

> **Estado:** implementada y probada en local contra el stack de compose (gateway real y una API de GitHub falsa). Aún no hay una versión publicada (`dist/` no se versiona) ni un gateway público, así que todavía no corre en un runner alojado por GitHub: ver [Cómo se demuestra y cómo se usaría](#cómo-se-demuestra-y-cómo-se-usaría).

**Privacidad:** el código fuente **nunca sale del runner**; solo viajan nombres, versiones y licencias de dependencias (el filtro de privacidad del motor, `buildAnalysisRequest`).

## Uso

```yaml
# .github/workflows/gyde.yml del proyecto del cliente
on: pull_request
permissions:
  contents: read
  pull-requests: write # para comentar el PR
jobs:
  gyde:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gyde/gyde-action@v1 # nombre final por definir
        id: gyde
        with:
          api-key: ${{ secrets.GYDE_API_KEY }}
          api-url: https://api.gyde.example
          fail-on: high
```

## Entradas

| Entrada | Por defecto | Qué hace |
|---|---|---|
| `api-key` | (obligatoria) | API key de Gyde. Guárdala como secreto. Se registra con `core.setSecret` antes de cualquier otra cosa, así que el runner la enmascara en los logs |
| `api-url` | (obligatoria) | URL del gateway de Gyde (http o https) |
| `project-path` | `.` | Carpeta del proyecto, relativa al workspace. No puede salir de `GITHUB_WORKSPACE` |
| `fail-on` | `high` | Severidad mínima que hace fallar el paso: `critical`, `high`, `medium`, `low`, `info` o `none` |
| `fail-on-degraded` | `false` | Si es `true`, un reporte degradado (sin la capa de IA) hace fallar el paso. Si no, solo es una advertencia |
| `include-ai` | `true` | Pide las explicaciones de IA (el estudio necesita un plan con IA y su llave configurada) |
| `comment-on-pr` | `true` | Publica el reporte como comentario del PR |
| `github-token` | `${{ github.token }}` | Token para comentar. El del workflow basta si tiene `pull-requests: write` |

## Salidas

`analysis-id`, `risk-score` (vacío si no corrió la capa de severidad) y `degraded` (`"true"` o `"false"`).

## Comportamiento

- **Un solo comentario por PR.** El comentario empieza con el marcador oculto `<!-- gyde-report -->`. Cada ejecución busca el comentario con el marcador **escrito por la misma cuenta** (`github-actions[bot]` con el token del workflow, o el usuario de un token personal) y lo edita; si no existe, lo crea. Un comentario de otra persona con el marcador no se toca.
- **Resumen del job.** El reporte se escribe siempre en el resumen de la ejecución (pestaña *Summary*), haya PR o no. Si el comentario supera el límite de GitHub (65 536 caracteres), se recorta y remite al resumen.
- **Fuera de un PR** (`push`, `schedule`, `workflow_dispatch`) no se comenta: el reporte queda en el resumen.
- **PR desde un fork:** GitHub no entrega los secretos (falta `api-key` → el paso falla con un mensaje que lo explica) y el token es de solo lectura (un `403` al comentar es una advertencia, no un fallo).
- **Contenido no confiable.** El Markdown viene del backend y, a través de él, de avisos externos: se quitan los caracteres de control, la API key se sustituye por `***` si apareciera, y una `@` al inicio de palabra lleva un espacio de ancho cero para que un nombre de paquete no pueda mencionar (y notificar) a personas o equipos. Si el backend no devuelve Markdown, se publica el reporte en texto plano dentro de un bloque de código.
- **Errores del gateway** fallan el paso con el mensaje y la pista de `GydeApiError`.

## Cómo se demuestra y cómo se usaría

**`dist/` no se versiona.** GitHub ejecuta `dist/index.js` sin instalar dependencias, pero ese archivo es un artefacto de `build` y está en `.gitignore`, así que no hay una versión de la Action lista para `uses:` en el repositorio. Publicar una versión es: `pnpm --filter @gyde/github-action build`, commitear `dist/` (con `git add -f`) solo en el commit de la etiqueta (`v1.0.0` y el alias móvil `v1`) y referenciarla como `uses: <owner>/<repo>/apps/github-action@v1`.

**Un runner de GitHub no alcanza un gateway en `localhost`.** Los runners alojados (`runs-on: ubuntu-latest`) corren en la nube de GitHub: `http://localhost:4000` es el propio runner, no tu máquina. Mientras el gateway solo exista en el stack de compose, la Action se demuestra así:

- **Con las pruebas** (`pnpm --filter @gyde/github-action test`): `run()` recibe el entorno y la E/S inyectados y un `fetch` falso, y cubre el comentario único que se edita, el saneado, `fail-on` y los errores de GitHub.
- **Con el bundle contra el gateway real y una API de GitHub falsa**: un servidor HTTP local que imita `GET /user` y los endpoints de comentarios de issues, apuntado con `GITHUB_API_URL` (ver [Desarrollo](#desarrollo)). Así se comprueba de punta a punta que se crea el comentario, que una segunda ejecución lo edita y que la llave no aparece en el comentario, el resumen ni las salidas.
- **Con un gateway público**: un despliegue, o un túnel temporal hacia el gateway local, que se pasa en `api-url`. Un túnel expone el gateway a internet mientras está abierto: usa una API key de prueba, ciérralo al terminar y revoca la llave. Un runner *self-hosted* en la misma máquina también alcanza `localhost`, pero solo en un repositorio privado (en uno público, cualquier PR ejecutaría código en esa máquina).

**Cómo se usaría.** Con una versión publicada y un gateway público, el workflow es el de [Uso](#uso): el secreto `GYDE_API_KEY` en el repositorio, `permissions: pull-requests: write` y `api-url` con la URL pública. Mientras no haya versión, se puede copiar la Action construida dentro del repositorio que se analiza:

```bash
pnpm --filter @gyde/github-action build
mkdir -p <repo>/.github/actions/gyde/dist
cp apps/github-action/action.yml <repo>/.github/actions/gyde/
cp apps/github-action/dist/index.js <repo>/.github/actions/gyde/dist/
```

y usarla con `uses: ./.github/actions/gyde` después de `actions/checkout`.

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/main.ts` | Arranque: conecta `run()` con `@actions/core` |
| `src/run.ts` | Orquesta y decide el resultado; recibe el entorno y la E/S inyectados, así se prueba sin runner |
| `src/inputs.ts` | Lee y valida las entradas de `action.yml` |
| `src/pull-request.ts` | Número del PR a partir de `GITHUB_EVENT_PATH` |
| `src/pull-request-comment.pipeline.ts` | `extends GitHubActionPipeline`: solo sobrescribe `publishResult` |
| `src/comment-body.ts` | Marcador, saneado y recorte del comentario (funciones puras) |
| `src/github-comments.ts` | Los pocos endpoints REST de GitHub que hacen falta, con `fetch` |

## Desarrollo

```bash
pnpm --filter @gyde/github-action test
pnpm --filter @gyde/github-action build   # dist/index.js, todo incluido
```

`dist/index.js` lleva todo dentro (GitHub lo ejecuta sin `node_modules`). Como algunas dependencias son CommonJS, el bundle define `require` con `createRequire` en su cabecera. `dist/` está en `.gitignore`: se commitea al publicar una versión.

Para probarlo en local sin runner, ejecuta el bundle con las variables que pondría GitHub (`GITHUB_WORKSPACE`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, `GITHUB_API_URL`, `GITHUB_STEP_SUMMARY`, `GITHUB_OUTPUT` y una `INPUT_<NOMBRE>` por entrada). Fuera de un runner la línea `::add-mask::` que emite `core.setSecret` **se imprime con la llave**: no pegues esa salida en ningún sitio.
