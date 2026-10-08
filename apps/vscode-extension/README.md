# vscode-extension: extensión de VS Code

Extensión **local** para analizar el proyecto abierto sin salir del editor. Usa el mismo motor que el CLI (`@gyde/analysis-engine`).

> **Estado:** esqueleto: manifiesto, comando `Gyde: Analyze project` y `activate()` que avisa que aún no está implementado. Implementación: **Área 2** (`docs/tasks/area-2-web-pagos-y-superficies.md`). **Es lo primero que se recorta si hay retraso.**

**Privacidad:** el análisis corre en la máquina del usuario; solo viajan nombres, versiones y licencias de dependencias.

## Qué implementar

1. El comando `gyde.analyze`: detectar el motor del workspace, ejecutar el pipeline y mostrar el resultado.
2. Guardar la API key en `context.secrets` (almacén seguro de VS Code), nunca en `settings.json`.
3. Panel o *output channel* con el reporte (con los colores y la tipografía de `@gyde/design-tokens`).
4. Diagnósticos en el archivo de dependencias (`manifest.json`, `.csproj`, `Build.cs`) para cada hallazgo.

## Desarrollo

```bash
pnpm --filter @gyde/vscode-extension build   # genera dist/extension.cjs
```

Para depurar: abre esta carpeta en VS Code y pulsa F5 (host de extensión). Para empaquetar (`.vsix`) se usa `@vscode/vsce` cuando llegue el momento.
