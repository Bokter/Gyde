# Gyde

Plataforma SaaS que detecta y gestiona vulnerabilidades, conflictos de licencias y riesgos de compatibilidad en proyectos de videojuegos (Unity y Unreal Engine), apoyándose en bases de datos públicas de vulnerabilidades y en documentación oficial. Se ofrece con planes de suscripción cobrados con Stripe.

> **Estado:** MVP en construcción (5 días, 4 personas). El repositorio contiene la estructura base y el esqueleto de cada componente; la lógica de negocio se reparte por áreas (ver `docs/tasks/`).

## Qué hace

- **El análisis empieza en el entorno del cliente** (CLI, GitHub Action o extensión de VS Code). El código fuente **nunca sale de ahí**: solo viajan nombres de dependencias, versiones y licencias.
- El backend cruza esa información con fuentes públicas (CVE, GHSA, OSV, NVD) y documentación oficial, normalizadas en un esquema común.
- Un LLM, con la llave del propio estudio (BYOK), interpreta y correlaciona la evidencia con el contexto del proyecto.
- El resultado es un reporte de riesgo **priorizado y explicable** (evidencia, impacto, recomendación).
- Si el proveedor de IA falla o no está configurado, el análisis determinístico (vulnerabilidades y licencias) sigue entregando resultados: el sistema **degrada, no se cae**.

## Arquitectura de un vistazo

Estilo de microservicios con aislamiento de fallos. Patrones: Circuit Breaker, Service Discovery (arquitectónicos) y Abstract Factory, Template Method, Decorator (diseño).

```mermaid
flowchart TB
    cliente["CLI · GitHub Action · Extensión VS Code<br/>(corren en el entorno del cliente)"]
    subgraph backend["Backend Gyde (microservicios)"]
        gw["API Gateway"]
        web["Servicio Web"]
        rep["Servicio de Reportes"]
        ret["Servicio de Retrieval"]
        norm["Pipeline de Normalización"]
        llm["Servicio Análisis LLM"]
        reg["Service Registry<br/>+ Health Checker"]
    end
    stripe(["Stripe"])
    fuentes(["Fuentes externas<br/>CVE · GHSA · OSV · docs"])
    ia(["Proveedores de IA<br/>llave del estudio (BYOK)"])

    cliente -->|HTTPS / JSON| gw
    gw --> web
    gw --> rep
    rep --> ret
    ret --> norm
    ret --> llm
    llm --> rep
    web <--> stripe
    norm <--> fuentes
    llm <--> ia
    gw -.->|descubre instancias| reg
```

## Mapa del repositorio

| Carpeta | Contenido |
|---|---|
| `apps/` | Lo que corre en la máquina del cliente: `cli`, `github-action`, `vscode-extension` |
| `services/` | Un contenedor por carpeta: `gateway`, `web`, `normalization`, `retrieval`, `llm-analysis`, `reports`, `registry` |
| `packages/` | Librerías compartidas: `contracts`, `analysis-engine`, `resilience`, `discovery`, `service-kit`, `design-tokens` |
| `tooling/` | Configuración compartida (TypeScript, ESLint, Prettier, Vitest) |
| `infra/` | Docker Compose, esquemas de PostgreSQL y scripts de desarrollo |
| `fixtures/` | Proyectos Unity/Unreal de ejemplo y respuestas grabadas de fuentes externas |
| `docs/` | Arquitectura, decisiones (ADR), diseño, flujo de trabajo y tareas por área |

## Stack

TypeScript · pnpm + Turborepo · Fastify (servicios) · Next.js (Servicio Web) · PostgreSQL · Docker Compose · Vitest.

## Cómo contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md): ramas, commits (Conventional Commits), pull requests y reglas de arquitectura.

## Licencia

[MIT](LICENSE)
