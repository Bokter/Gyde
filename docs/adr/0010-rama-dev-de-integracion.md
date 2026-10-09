# 0010. Rama `dev` de integración antes de `main`

- **Estado:** Aceptada
- **Fecha:** 2026-10-09

## Contexto

Cuatro personas integran trabajo en paralelo durante 5 días. La base inicial se dejó en `main` y el plan original proponía GitHub Flow con una sola rama larga. El equipo prefiere que `main` quede reservada a lo estable y demostrable, y que la integración diaria ocurra en otra rama.

## Decisión

- **`main`**: versión estable y demostrable. Solo recibe PRs desde `dev`, abiertos por el líder en cada hito, integrados con **merge commit**.
- **`dev`**: rama de integración y rama **por defecto**. Recibe PRs desde ramas de trabajo, integrados con **squash merge**.
- **Ramas de trabajo** `<tipo>/<módulo>-<descripción>` (por ejemplo `feat/gateway-api-key-auth`): se crean desde `dev`, viven menos de un día y se borran al integrar.
- Nadie empuja directo a `dev` ni a `main`. Ambas se protegen con PR, 1 aprobación y CI verde (`Quality gates` y `Conventional PR title`).
- Un arreglo urgente sale de `main`, entra a `main` por PR y se lleva a `dev` con otro PR.
- El CI corre en PRs y en pushes hacia `dev` y `main`; Dependabot apunta a `dev`.

## Consecuencias

- `main` siempre es presentable: lo que llega ahí ya pasó la integración en `dev`.
- Hay un paso más que revisar (el PR de release), pero ocurre pocas veces (hitos de los días 3, 4 y 5).
- Se permiten dos modos de merge en GitHub: squash (ramas de trabajo → `dev`) y merge commit (`dev` → `main`); con squash en los releases, `dev` y `main` divergerían y cada release traería conflictos.
- No se exige historia lineal en `main`.

## Alternativas descartadas

- **Solo `main` (GitHub Flow puro):** más simple, pero cualquier integración a medias llega a la rama que se presenta.
- **Ramas largas por área:** generan conflictos grandes al final; las ramas de trabajo siguen siendo cortas.
- **Squash también en `dev` → `main`:** historia más limpia en `main`, a costa de divergencia permanente entre ramas.
