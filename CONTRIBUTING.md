# Guía de contribución

Gracias por aportar a Gyde. Somos 4 personas con 5 días de plazo: las reglas de abajo existen para que podamos trabajar en paralelo sin pisarnos. Léela completa una vez; es corta.

## 1. Principios

1. **El código fuente del cliente nunca sale de su entorno.** Al backend solo viajan nombres, versiones y licencias de dependencias. El esquema `AnalysisRequest` de `packages/contracts` es estricto a propósito: no lo relajes.
2. **Contrato primero.** Lo que dos piezas se dicen vive en `packages/contracts` (esquemas zod + tipos). Cambia el contrato antes de cambiar el código que lo usa.
3. **Arquitectura limpia.** La lógica de negocio no conoce frameworks, bases de datos ni proveedores (ver sección 5).
4. **Degradar, no caerse.** Toda llamada saliente pasa por `packages/resilience` (Circuit Breaker + caché de respaldo). El análisis determinístico debe seguir funcionando aunque el LLM falle.
5. **Cero secretos en el repositorio.** Ver sección 7.

## 2. Flujo de trabajo

Usamos **GitHub Flow con una rama de integración**: `main` es lo estable (lo que se demuestra y se entrega) y `dev` es donde se integra el trabajo de las cuatro áreas. **Nadie empuja directo a `dev` ni a `main`**: todo entra por pull request.

```
rama de trabajo (feat/…)  ──PR · squash merge──▶  dev  ──PR de release · merge commit──▶  main
```

| Rama | Para qué | Cómo entra el código |
|---|---|---|
| `main` | Versión estable y demostrable | PR desde `dev` abierto por el líder en cada hito, con **merge commit** |
| `dev` | Integración continua del equipo. Es la rama por defecto | PR desde una rama de trabajo, con **squash merge** |
| `<tipo>/<módulo>-<descripción>` | Una unidad de trabajo corta | Se crea **desde `dev`**, se integra a `dev` y se borra |

Paso a paso:

1. Parte siempre de `dev` actualizada: `git fetch origin && git switch dev && git pull`.
2. Crea una rama corta con el formato `<tipo>/<módulo>-<descripción>`, en minúsculas y con guiones: `feat/gateway-api-key-auth`, `fix/reports-null-severity`, `docs/tasks-area-3`.
3. Haz commits pequeños (sección 3) y empuja pronto. Abre el **PR en borrador hacia `dev`** desde el primer push para que el equipo vea el avance.
4. Una rama vive **un día como máximo**. Si crece, divídela: es mejor integrar poco y seguido que mucho al final.
5. Antes de pedir revisión: `git rebase origin/dev`, pasa la verificación local (sección 6) y marca el PR como listo.
6. Se necesita **1 aprobación** y el **CI en verde**. Los cambios en `packages/contracts` los revisa además alguien de **otra área** (es el acuerdo entre ustedes).
7. Se integra con **squash merge**: el título del PR pasa a ser el commit en `dev`, por eso debe seguir Conventional Commits.
8. Borra la rama al integrar.

**Releases (`dev` → `main`).** Cuando `dev` pasa la lista de verificación del hito (día 3, día 4 de integración y día 5), el líder abre un PR `dev → main` titulado `chore: release <hito>` y lo integra con **merge commit** (no squash, para que `dev` y `main` no diverjan). `main` no recibe nada que no haya pasado antes por `dev`.

**Arreglo urgente en `main`.** Se parte de `main`, se abre el PR hacia `main` y, una vez integrado, el mismo cambio se lleva a `dev` con otro PR (`main → dev`).

Cada carpeta tiene dueño (ver `.github/CODEOWNERS`). Trabaja dentro de tu área; si necesitas algo en la de otra persona, abre un PR pequeño o un issue y avísale. Reunión de sincronización diaria de 15 minutos.

## 3. Commits (Conventional Commits)

Formato: `tipo(scope): descripción en imperativo, en inglés y sin punto final`.

```
feat(gateway): add API key authentication
fix(reports): handle findings without severity
docs(tasks): clarify area 3 acceptance criteria
```

**Tipos:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

**Scopes:**

| Grupo | Scopes |
|---|---|
| Servicios | `gateway`, `web`, `normalization`, `retrieval`, `llm-analysis`, `reports`, `registry` |
| Paquetes | `contracts`, `analysis-engine`, `resilience`, `discovery`, `service-kit`, `design-tokens` |
| Apps | `cli`, `github-action`, `vscode-extension` |
| Transversales | `repo`, `tooling`, `ci`, `infra`, `fixtures`, `deps`, `deps-dev` (los dos últimos los usa Dependabot) |
| Documentación | `architecture`, `adr`, `design`, `tasks`, `workflow`, `readme` |

Si un cambio cruza varios módulos, omite el scope. Un cambio incompatible lleva `!` (`feat(contracts)!: ...`) y un pie `BREAKING CHANGE:`. El hook local y el CI validan el formato (`commitlint`).

## 4. Idiomas

- **Código, identificadores, comentarios, commits y títulos de PR:** inglés.
- **Documentación (`*.md`) y textos de la interfaz de usuario:** español.

## 5. Estructura y reglas de capas

Cada servicio sigue la misma estructura:

```
services/<nombre>/src/
├─ domain/          # entidades y reglas puras: sin I/O, sin frameworks (ni NestJS)
├─ application/     # casos de uso + puertos (interfaces) y su token de inyección; sin NestJS
├─ infrastructure/  # adaptadores @Injectable que implementan los puertos (DB, HTTP, Stripe, LLM…)
├─ http/            # controladores NestJS; validan con @gyde/contracts (ZodValidationPipe)
├─ config.ts        # variables de entorno validadas con zod
├─ app.module.ts    # composition root: enlaza cada puerto con su adaptador
└─ main.ts          # arranque (createApp + startService)
```

Las dependencias van hacia adentro: `http → application → domain` e `infrastructure → application`. `domain` y `application` no importan las capas exteriores ni librerías de infraestructura, **incluido NestJS**. ESLint lo comprueba y el CI falla si se viola.

**NestJS** ([ADR 0011](docs/adr/0011-nestjs-como-framework-de-los-servicios.md)): los casos de uso son clases normales; en `app.module.ts` se construyen con `useFactory` y cada puerto se enlaza a su adaptador por su token (`{ provide: REPORT_REPOSITORY, useClass: ... }`). Siempre `@Inject(TOKEN)` explícito en los constructores, porque `esbuild` (tsup y Vitest) no emite metadatos de decoradores. Los contratos son zod, no DTO con `class-validator`. En las pruebas: `const app = await createApp(...)`, `app.inject(...)` y `afterAll(() => app.close())`.

Los paquetes de `packages/` no contienen lógica propia de un servicio. Si dos servicios necesitan lo mismo, se evalúa moverlo a un paquete; si solo lo usa uno, se queda en ese servicio.

## 6. Calidad y entorno de desarrollo

Desarrollamos **con Docker** para no instalar dependencias en la carpeta del repositorio (que puede estar en OneDrive). Los comandos exactos están en el [README](README.md#primeros-pasos).

Antes de abrir un PR deben pasar `format:check`, `lint`, `typecheck`, `test` y `build`. El CI ejecuta lo mismo.

Un PR está **listo** cuando:

- [ ] cumple los criterios de aceptación de su tarea en `docs/tasks/`;
- [ ] trae pruebas para el comportamiento nuevo (o explica por qué no);
- [ ] actualiza el `README.md` del módulo y `.env.example` si cambia el comportamiento o la configuración;
- [ ] respeta las reglas de capas y no relaja contratos de privacidad;
- [ ] no incluye secretos, datos personales ni código fuente de proyectos de clientes.

## 7. Seguridad y secretos

- `.env` está ignorado por git; solo se versiona `.env.example`, con placeholders.
- Stripe: **solo llaves de modo test** durante el desarrollo.
- Las llaves de LLM de los estudios (BYOK) se cifran en reposo, nunca se escriben en logs ni respuestas de error y solo viajan por el endpoint interno autenticado. Ver `docs/architecture/04-datos-privacidad-seguridad.md`.
- Si commiteas un secreto por error, **revócalo de inmediato** en el proveedor y avisa al equipo; borrarlo del historial no basta.
- Vulnerabilidades del propio Gyde: sigue `SECURITY.md`.
