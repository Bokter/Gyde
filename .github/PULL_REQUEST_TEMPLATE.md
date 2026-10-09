> **Base del PR: `dev`.** Solo el líder abre PRs `dev` → `main` (releases).

## Qué cambia y por qué

<!-- Una o dos frases. El título del PR debe seguir Conventional Commits: `feat(gateway): add API key authentication`. -->

## Tarea

<!-- Enlace al issue o al brief: docs/tasks/area-N-... -->

## Cómo se probó

<!-- Pruebas nuevas, comandos que corriste, capturas si hay interfaz. -->

## Checklist

- [ ] Cumple los criterios de aceptación de la tarea (los `it.todo` que implementé ahora son pruebas reales).
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pasan (o `docker build -f infra/docker/dev.Dockerfile --target check .`).
- [ ] Respeta las capas (`http → application → domain`, `infrastructure → application`).
- [ ] No relaja contratos de privacidad: nada de código fuente, rutas ni datos del cliente fuera de su entorno.
- [ ] No incluye secretos ni los escribe en logs; `.env.example` actualizado si hay variables nuevas.
- [ ] Actualicé el README del módulo si cambió su comportamiento.
- [ ] Si toca `packages/contracts`, avisé a las áreas que lo consumen y pedí revisión de otra área.
- [ ] El PR es chico (menos de un día de trabajo) y está rebaseado sobre `origin/dev`.
