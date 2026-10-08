# 0007. Llaves LLM por estudio (BYOK)

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

El Servicio Web "administra y configura los LLM usados (llaves, credenciales)". No queda claro si esas llaves son de la plataforma o de cada estudio. El líder del proyecto decidió que **cada estudio carga su propia llave** (*bring your own key*).

## Decisión

- Cada **tenant** registra proveedor, modelo y llave en el Servicio Web. La llave se **prueba** contra el proveedor y se guarda **cifrada** (AES-256-GCM, claves maestras por `kid`).
- La UI **nunca** recibe la llave en claro (solo `keyLast4`).
- llm-analysis obtiene la llave **bajo demanda** por un endpoint interno nuevo, `GET /internal/tenants/:tenantId/llm-config` (arista `llm-analysis → web`, ausente del diagrama original), solo por red interna y con token; la usa durante la llamada y la descarta.
- **Circuit Breaker por tenant + proveedor.**
- La llave **no se escribe nunca en logs, errores ni mensajes**; `@gyde/service-kit` censura los campos sensibles.
- Sin llave configurada, o con un plan que no incluye IA, no hay capa de IA: si se esperaba, el reporte es **degradado** (`llm-not-configured`); si no, simplemente no la lleva.

## Consecuencias

- Gyde no paga el uso de IA de sus clientes ni administra cuotas de proveedor.
- Gyde **custodia secretos de terceros**: sube el listón de seguridad (cifrado, rotación, cero logging, endpoint interno protegido). Es la parte más delicada del Servicio Web.
- Los planes se diferencian por límites y capas (permisos), no por costo de IA.

## Alternativas descartadas

- **Llaves solo de la plataforma:** más simple y seguro, pero Gyde absorbería el costo de IA y deja a los estudios sin control sobre el proveedor que procesa sus metadatos.
- **Ambas (plataforma por defecto + BYOK opcional):** lo más completo y lo más caro para 5 días. Queda como evolución posible: el esquema se puede ampliar sin romper lo existente.
