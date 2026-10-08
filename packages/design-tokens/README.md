# @gyde/design-tokens

Tokens de diseño de Gyde: **una sola fuente de verdad** (JSON estilo W3C DTCG) compilada a **variables CSS** `--gyde-*`. Los usan el Servicio Web, el visor de reportes y la extensión de VS Code.

> Fuente, paleta y reglas de uso: [`docs/design/sistema-de-diseno.md`](../../docs/design/sistema-de-diseno.md).

## Dos capas

| Capa | Archivo | Ejemplo | Quién la usa |
|---|---|---|---|
| **Primitivos** | `tokens/palette.json` | `palette.green.600` → `#0E7002` | Solo `tokens/color.json` |
| **Semánticos** | `tokens/color.json` | `color.action.primary.bg` → `{palette.green.600}` | **Los componentes** |

Los componentes usan siempre tokens **semánticos**: así un tema oscuro solo remapea `color.json`. Las demás familias: `typography.json` (`font.*`) y `foundations.json` (`space`, `radius`, `shadow`, `motion`, `breakpoint`, `z`).

## Uso

```bash
pnpm --filter @gyde/design-tokens build     # genera dist/tokens.css y dist/tokens.json
```

```css
/* en la app web */
@import '@gyde/design-tokens/css';

.button {
  background: var(--gyde-color-action-primary-bg);
  color: var(--gyde-color-action-primary-fg);
  border-radius: var(--gyde-radius-md);
  font-family: var(--gyde-font-family-body);
  transition: background var(--gyde-motion-duration-fast) var(--gyde-motion-easing-standard);
}
```

El CSS generado anula las duraciones de movimiento bajo `prefers-reduced-motion`. Las fuentes (Bricolage Grotesque, Figtree, JetBrains Mono) se cargan con `next/font` en la app web; los tokens solo fijan los nombres.

## Accesibilidad protegida por pruebas

`test/tokens.test.ts` comprueba el contraste WCAG de **cada par texto/fondo** y de los bordes de controles. Si cambias un color y baja del mínimo (4.5:1 texto normal, 3:1 controles), la prueba falla. Un alias roto o un ciclo también falla ahí, no en producción.

## Cómo añadir o cambiar un token

1. Edita el JSON correspondiente. Valores literales solo en `palette.json` y `foundations.json`; en `color.json` usa alias (`"{palette.green.600}"`).
2. Si es un par de colores nuevo, añádelo a la tabla de `test/tokens.test.ts`.
3. `pnpm --filter @gyde/design-tokens test && pnpm --filter @gyde/design-tokens build`.

Los valores de `shadow.*` son cadenas de CSS `box-shadow` (no el objeto compuesto de DTCG) para mantener el generador simple.
