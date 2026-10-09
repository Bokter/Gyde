# Configuración de GitHub (una sola vez)

Lo que sigue **no se puede guardar en el repositorio**: se configura en la web de GitHub, por quien administra el repo (el líder). Hazlo antes de que el equipo empiece a abrir PRs. Marca cada paso al terminar.

El flujo es `rama de trabajo → dev → main` (ver [`CONTRIBUTING.md`](../../CONTRIBUTING.md), sección 2).

## 0. Orden de arranque (la primera vez)

1. Integra a `main` el PR que introduce el flujo con `dev` (todavía sin protecciones).
2. Crea `dev` desde `main`: `git switch main && git pull && git switch -c dev && git push -u origin dev`.
3. Pon `dev` como **rama por defecto** (paso 3) y activa las protecciones (pasos 4 y 5).
4. **Limpia los PRs de Dependabot** que se abrieron antes de existir `dev` (apuntan a `main`):
   - Ciérralos todos. **Al cerrar un PR, Dependabot borra su rama solo**: no borres ramas `dependabot/*` a mano.
   - Los de `@types/node` y `@types/vscode` **no volverán**: `.github/dependabot.yml` ya los ignora a propósito (los tipos deben coincidir con Node 24 y con `engines.vscode`).
   - Los de acciones del CI Dependabot los **abre de nuevo contra `dev`** en su próxima corrida semanal, o al instante comentando `@dependabot recreate` en el PR antes de cerrarlo. Los revisa el Área 1 de a uno (los saltos de versión mayor pueden romper el CI).
   - Haz esto **después** de integrar a `main` el PR que trae las reglas de `dependabot.yml`; si no, podría reabrir los de tipos.
5. Solo entonces avisa al equipo: cada quien parte de `dev`.

## 1. Acceso

- [ ] **Settings → Collaborators:** invita a las otras tres personas con rol **Write** (hay invitaciones pendientes hasta que las acepten).
- [ ] Decide la visibilidad del repositorio (público o privado) **antes** de publicar. La licencia es MIT; si el producto se va a comercializar, revisa si quieres otra.

## 2. Cómo se integran los PRs (Settings → General → Pull Requests)

- [ ] Permitir **Squash merging** (lo usan los PRs hacia `dev`) y **Merge commits** (solo para los PRs de release `dev → main`). Desmarca *Rebase merging*.
- [ ] *Default commit message* del squash: **Pull request title and description** (el título del PR pasa a ser el commit en `dev`; por eso debe seguir Conventional Commits).
- [ ] **Automatically delete head branches.**
- [ ] *Always suggest updating pull request branches.*

> Por qué también *merge commit*: si `dev → main` se integrara con squash, `dev` y `main` divergerían y cada release traería conflictos. Los PRs de las ramas de trabajo siempre van con squash.

## 3. Rama por defecto (Settings → General → Default branch)

- [ ] Cambia la rama por defecto a **`dev`**. Así los PRs nuevos apuntan a `dev` sin tocar nada, y Dependabot también.

## 4. Protección de `dev` (Settings → Rules → Rulesets)

Una regla para `dev` con:

- [ ] **Require a pull request before merging**, con **1 aprobación**; marca *Dismiss stale approvals when new commits are pushed*.
- [ ] **Require status checks to pass:** `Quality gates` y `Conventional PR title` (aparecen tras el primer PR con el CI).
- [ ] **Require conversation resolution before merging.**
- [ ] **Block force pushes** y **Restrict deletions.**
- [ ] *(Recomendado para `packages/contracts`)* **Require review from Code Owners**.

## 5. Protección de `main`

Una regla para `main` con:

- [ ] **Require a pull request before merging** y **1 aprobación** (la da otra persona del equipo).
- [ ] **Require status checks to pass:** `Quality gates` y `Conventional PR title`.
- [ ] **Restrict who can push / merge:** solo el líder abre y aprueba los PRs de release (`dev → main`).
- [ ] **Block force pushes** y **Restrict deletions.**
- [ ] **No** actives *Require linear history*: los releases entran con merge commit.

El job `Docker image` del CI está en modo informativo hasta que el Área 1 lo deje verde; no lo marques como obligatorio todavía.

## 6. Actions (Settings → Actions → General)

- [ ] *Workflow permissions:* **Read repository contents** (el CI solo necesita leer).
- [ ] *Actions permissions:* permitir acciones de GitHub y de creadores verificados.
- [ ] Endurecimiento posterior: fijar las acciones de `ci.yml` por **SHA de commit** (Dependabot las mantiene al día).

## 7. Seguridad (Settings → Code security)

- [ ] **Dependabot alerts** y **Dependabot security updates** activados (`.github/dependabot.yml` agenda las actualizaciones semanales hacia `dev`).
- [ ] **Secret scanning** y **Push protection** activados: bloquean la subida de llaves por error.
- [ ] **Private vulnerability reporting** activado (lo usa `SECURITY.md`).
- [ ] *(Opcional)* **Code scanning** con la configuración por defecto de CodeQL.

## 8. Etiquetas e issues

- [ ] Etiquetas: `area-1`, `area-2`, `area-3`, `area-4`, `contracts`, `blocked`, `task`, `bug`.
- [ ] Opcional: un tablero de Projects con las columnas *Por hacer · En curso · En revisión · Hecho*, alimentado por los issues de tarea (`.github/ISSUE_TEMPLATE/task.yml`).

## 9. CODEOWNERS

`.github/CODEOWNERS` ya tiene a cada área asignada a su responsable. Cuando las invitaciones estén aceptadas, activa en `dev` la opción **Require review from Code Owners**.

## 10. Secretos del repositorio

El CI **no necesita secretos**. Si más adelante se añaden (por ejemplo, para publicar imágenes), guárdalos en *Settings → Secrets and variables → Actions* y nunca en archivos del repositorio.

## 11. Configuración local recomendada de git

```bash
git config --global core.longpaths true
git config --global pull.rebase true
git config --global fetch.prune true
```

`.gitattributes` ya fuerza fin de línea LF en el repositorio, también en Windows.
