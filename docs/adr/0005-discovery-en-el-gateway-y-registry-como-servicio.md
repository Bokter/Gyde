# 0005. Discovery en el Gateway y Registry como servicio de infraestructura

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

- El texto del patrón Service Discovery (sección 3.2) dice que **el cliente** (Action o extensión) consulta el registry. Pero el diagrama de contenedores muestra al cliente hablando solo con el Gateway, y los diagramas de secuencia ponen la consulta al Registry en la "Interfaz" (el borde del backend).
- El **Service Registry** y el **Health Checker** aparecen como participantes en el texto, pero no están dibujados como contenedores.

## Decisión

1. El **Gateway** es quien descubre instancias (descubrimiento del lado del servidor). El cliente solo conoce la URL del Gateway, que es estable.
2. El **Service Registry** (con el Health Checker) es un **servicio de infraestructura mínimo**, el séptimo contenedor del backend, no un módulo embebido en el Gateway.
3. Todos los servicios se registran con `@gyde/discovery`; las llamadas entre servicios también resuelven por el registry.
4. Si el registry no responde, se usan **URLs estáticas** del entorno (`*_URL`) como respaldo.

## Consecuencias

- El patrón queda visible y probado como pieza propia, sin añadir responsabilidades al Gateway.
- Un contenedor más que coordinar, pero pequeño (estado en memoria, las instancias se vuelven a registrar solas).
- El registry es una dependencia más: por eso el respaldo con URLs estáticas.

## Alternativas descartadas

- **Registry embebido en el Gateway:** una pieza menos, pero el patrón queda menos visible y el Gateway gana una responsabilidad.
- **El cliente consulta el registry (texto literal de 3.2):** obliga a exponer el registry a Internet y a que cada cliente conozca más de un punto de entrada.
