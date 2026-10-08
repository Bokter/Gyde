# infra

Todo lo necesario para levantar Gyde en local con **Docker** (ver [ADR 0008](../docs/adr/0008-desarrollo-con-docker-primero.md)): las dependencias viven en las imágenes, no en tu carpeta.

> **Estado:** `compose.yaml` pasa `docker compose config`; las imágenes aún **no se han construido** en una máquina con el daemon encendido. Primera tarea del **Área 1**: construirlas, corregir lo que falle y marcarlo aquí como verificado (`docs/tasks/area-1-plataforma-y-borde.md`).

## Contenido

| Ruta | Para qué |
|---|---|
| `docker/dev.Dockerfile` | Imagen de desarrollo y de verificación de todo el monorepo (etapas `dev` y `check`) |
| `../services/*/Dockerfile` | Imagen de **producción** de cada servicio (despliegue independiente) |
| `compose/compose.yaml` | PostgreSQL + los 6 servicios del backend (el Servicio Web se suma cuando exista) |
| `postgres/init/` | Crea un schema y un rol por servicio que persiste ([ADR 0009](../docs/adr/0009-postgresql-un-schema-por-servicio.md)) |
| `scripts/bootstrap-env.mjs` | Genera tu `.env` con secretos locales aleatorios (no pisa uno existente) |

## Primeros pasos

```bash
node infra/scripts/bootstrap-env.mjs
```

Si no tienes Node en tu máquina, hazlo en un contenedor:

```bash
docker run --rm -v "$PWD":/work -w /work node:24-alpine node infra/scripts/bootstrap-env.mjs
```

Levantar todo y que tus cambios se sincronicen dentro de los contenedores:

```bash
docker compose -f infra/compose/compose.yaml watch
```

Solo levantar (sin sincronizar cambios):

```bash
docker compose -f infra/compose/compose.yaml up --build
```

Verificar todo como lo hace el CI (formato, lint, tipos, pruebas y build), sin instalar nada en tu máquina:

```bash
docker build -f infra/docker/dev.Dockerfile --target check .
```

Ejecutar las pruebas de un servicio dentro del contenedor en marcha:

```bash
docker compose -f infra/compose/compose.yaml exec gateway pnpm --filter @gyde/gateway test
```

Si tienes pnpm instalado, los mismos comandos existen como scripts: `pnpm env:init`, `pnpm stack:watch`, `pnpm stack:up`, `pnpm stack:down`, `pnpm docker:check`.

## Puertos

| Servicio | Puerto |
|---|---|
| web (pendiente) | 3000 |
| gateway | 4000 |
| registry | 4100 |
| normalization | 4200 |
| retrieval | 4300 |
| llm-analysis | 4400 |
| reports | 4500 |
| PostgreSQL | 5432 |

Cada servicio expone `GET /healthz` (vivo) y `GET /readyz` (listo).

## Problemas conocidos en Windows

- **Poco espacio en `C:`:** el disco virtual de Docker Desktop vive en `C:` por defecto. Muévelo a un disco con holgura en *Docker Desktop → Settings → Resources → Advanced → Disk image location*.
- **Repo dentro de OneDrive:** no instales dependencias en esa carpeta; usa Docker o clona en una ruta corta fuera de OneDrive (por ejemplo `C:\dev\Gyde`).
- **Rutas largas:** Node y pnpm pueden fallar con rutas de más de ~260 caracteres. Mantén el repositorio en una ruta corta y, si hace falta, habilita las rutas largas de Windows y de git (`git config --global core.longpaths true`).
- **Saltos de línea:** el repositorio fuerza LF (`.gitattributes`); no los conviertas a CRLF.

## Contraseñas locales

Los scripts de `postgres/init/` usan contraseñas de **desarrollo** (`change-me-*`) que coinciden con `.env.example`. No son secretos y **no** deben reutilizarse en ningún entorno compartido.
