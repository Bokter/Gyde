# Configuración de GitHub (una sola vez)

Lo que sigue **no se puede guardar en el repositorio**: se configura en la web de GitHub, por quien administra el repo (el líder). Hazlo antes de que el equipo empiece a abrir PRs. Marca cada paso al terminar.

## 1. Acceso

- [ ] **Settings → Collaborators:** invita a las otras tres personas con rol **Write**.
- [ ] Decide la visibilidad del repositorio (público o privado) **antes** de publicar. La licencia es MIT; si el producto se va a comercializar, revisa si quieres otra.

## 2. Protección de `main` (Settings → Rules → Rulesets, o Branches)

Crea una regla para `main` con:

- [ ] **Require a pull request before merging**, con **1 aprobación**; marca *Dismiss stale approvals when new commits are pushed*.
- [ ] **Require status checks to pass:** añade `Quality gates` y `Conventional PR title` (aparecen tras el primer PR con el CI).
- [ ] **Require conversation resolution before merging.**
- [ ] **Require linear history** (coherente con el *squash merge*).
- [ ] **Block force pushes** y **Restrict deletions.**
- [ ] *(Recomendado para `packages/contracts`)* **Require review from Code Owners**, una vez rellenado `.github/CODEOWNERS`.

El job `Docker image` del CI está en modo informativo hasta que el Área 1 lo deje verde; no lo marques como obligatorio todavía.

## 3. Cómo se integran los PRs (Settings → General → Pull Requests)

- [ ] Permitir **solo Squash merging** (desmarca *Merge commits* y *Rebase merging*).
- [ ] *Default commit message* del squash: **Pull request title and description** (el título del PR pasa a ser el commit en `main`; por eso debe seguir Conventional Commits).
- [ ] **Automatically delete head branches.**
- [ ] *Always suggest updating pull request branches.*

## 4. Actions (Settings → Actions → General)

- [ ] *Workflow permissions:* **Read repository contents** (el CI solo necesita leer).
- [ ] *Actions permissions:* permitir acciones de GitHub y de creadores verificados.
- [ ] Endurecimiento posterior: fijar las acciones de `ci.yml` por **SHA de commit** (Dependabot las mantiene al día).

## 5. Seguridad (Settings → Code security)

- [ ] **Dependabot alerts** y **Dependabot security updates** activados (`.github/dependabot.yml` ya agenda las actualizaciones semanales).
- [ ] **Secret scanning** y **Push protection** activados: bloquean la subida de llaves por error.
- [ ] **Private vulnerability reporting** activado (lo usa `SECURITY.md`).
- [ ] *(Opcional)* **Code scanning** con la configuración por defecto de CodeQL.

## 6. Etiquetas e issues

- [ ] Etiquetas: `area-1`, `area-2`, `area-3`, `area-4`, `contracts`, `blocked`, `task`, `bug`.
- [ ] Opcional: un tablero de Projects con las columnas *Por hacer · En curso · En revisión · Hecho*, alimentado por los issues de tarea (`.github/ISSUE_TEMPLATE/task.yml`).

## 7. CODEOWNERS

- [ ] Cuando cada persona tenga su usuario de GitHub, sustituye los `<handle-area-N>` de `.github/CODEOWNERS` y descomenta las líneas.

## 8. Secretos del repositorio

El CI **no necesita secretos**. Si más adelante se añaden (por ejemplo, para publicar imágenes), guárdalos en *Settings → Secrets and variables → Actions* y nunca en archivos del repositorio.

## 9. Configuración local recomendada de git

```bash
git config --global core.longpaths true
git config --global pull.rebase true
git config --global fetch.prune true
```

`.gitattributes` ya fuerza fin de línea LF en el repositorio, también en Windows.
