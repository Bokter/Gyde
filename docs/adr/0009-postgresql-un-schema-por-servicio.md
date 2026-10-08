# 0009. PostgreSQL: un schema y un rol por servicio

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

La arquitectura exige que cada microservicio sea dueño de sus datos y pueda desplegarse de forma independiente, pero operar una base de datos por servicio es demasiado para un MVP de 5 días. Solo `web`, `normalization` y `reports` necesitan persistir.

## Decisión

Una instancia de PostgreSQL con **un schema y un rol por servicio que persiste** (`web`, `normalization`, `reports`):

- Cada rol tiene `search_path` fijado a su schema y **no tiene permisos** sobre los demás.
- Nadie lee tablas ajenas: se consulta por la API del servicio dueño.
- Las migraciones de cada servicio viven en el servicio (`services/<nombre>/`), no en un lugar común.
- Los scripts de inicialización (`infra/postgres/init/`) crean los schemas y roles.

## Consecuencias

- Aislamiento lógico real a bajo costo; mover un servicio a su propia base de datos es cambiar su `*_DATABASE_URL`.
- Gateway, Retrieval, llm-analysis y Registry son **sin estado** (caché en memoria), lo que simplifica el escalado.

## Alternativas descartadas

- **Una base de datos por servicio:** más fiel al ideal, más infraestructura de la que el MVP justifica.
- **Un schema compartido:** acopla los servicios por la base de datos, justo lo que se quiere evitar.
