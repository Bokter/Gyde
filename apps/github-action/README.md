# github-action: Gyde Security Scan

GitHub Action que corre el análisis **dentro del runner del cliente** (pipeline de CI/CD) y publica el reporte como comentario del pull request. Es una cáscara sobre `@gyde/analysis-engine` (`GitHubActionPipeline`).

> **Estado:** `action.yml` declarado y esqueleto (el paso falla indicando que no está implementada). Implementación: **Área 2** (`docs/tasks/area-2-web-pagos-y-superficies.md`), apoyándose en el motor del Área 4.

**Privacidad:** el código fuente **nunca sale del runner**; solo viajan nombres, versiones y licencias de dependencias.

## Uso previsto

```yaml
# .github/workflows/gyde.yml del proyecto del cliente
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  gyde:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gyde/gyde-action@v1   # nombre final por definir
        with:
          api-key: ${{ secrets.GYDE_API_KEY }}
          api-url: https://api.gyde.example
          fail-on: high
```

## Entradas

Declaradas en `action.yml`: `api-key`, `api-url`, `project-path`, `fail-on`, `include-ai`, `comment-on-pr`.

## Qué implementar

1. Leer las entradas y el entorno del runner (`GITHUB_WORKSPACE`, `GITHUB_EVENT_PATH`, token del workflow).
2. Construir `GitHubActionPipeline` con `GydeApiClient` y ejecutar `runAnalysis()`.
3. Publicar/actualizar **un único comentario** en el PR (sin duplicar en cada push) con el reporte en Markdown.
4. Fallar el paso según `fail-on`; resultado degradado = advertencia, no fallo, salvo que se pida.
5. Empaquetar en `dist/index.js` (todo incluido: GitHub lo ejecuta sin `node_modules`) y commitear `dist/` al publicar una versión.
6. No imprimir la API key en logs: `core.setSecret`.

## Desarrollo

```bash
pnpm --filter @gyde/github-action build
```
