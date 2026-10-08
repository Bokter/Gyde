# tooling

Configuración compartida del monorepo. No es un paquete del workspace: los archivos se referencian por ruta relativa.

| Ruta | Para qué sirve |
|---|---|
| `tsconfig/base.json` | Opciones estrictas de TypeScript comunes a todo el repo |
| `tsconfig/node.json` | Base para servicios, paquetes y apps de Node (`extends` desde cada `tsconfig.json`) |
| `eslint/layer-boundaries.mjs` | Reglas que imponen las capas de arquitectura limpia (`domain`, `application`, `infrastructure`, `http`) |

Cada paquete o servicio declara su `tsconfig.json` así:

```json
{
  "extends": "../../tooling/tsconfig/node.json",
  "include": ["src", "test"]
}
```

La configuración de ESLint (`eslint.config.mjs`) y de Prettier (`.prettierrc.json`) viven en la raíz para que el editor las encuentre sin configuración adicional.
