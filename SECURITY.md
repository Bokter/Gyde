# Política de seguridad

Gyde es una herramienta de seguridad: tomamos en serio las vulnerabilidades del propio proyecto.

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de GitHub: pestaña **Security → Report a vulnerability** del repositorio. Incluye:

- qué componente está afectado y cómo reproducirlo;
- el impacto que crees que tiene (por ejemplo, fuga de código del cliente o de una llave de IA);
- tu versión o el commit.

No incluyas datos reales de clientes ni llaves en el reporte.

## Qué consideramos prioritario

1. **Fugas de código fuente del cliente** hacia el backend: el contrato `AnalysisRequest` debe rechazar todo lo que no sean nombres, versiones y licencias.
2. **Exposición de llaves de IA de los estudios (BYOK)**: en logs, respuestas, errores o almacenamiento sin cifrar.
3. Saltarse la autenticación (API keys, token interno entre servicios, firma del webhook de Stripe).
4. Acceso a datos de otro *tenant*.

## Qué esperar

Es un proyecto académico en desarrollo (MVP): no hay un SLA formal, pero confirmaremos la recepción lo antes posible y te mantendremos al tanto de la corrección.

## Si encuentras un secreto en el repositorio

Revócalo de inmediato en el proveedor correspondiente y avísanos por el mismo canal privado. Borrarlo del historial no lo vuelve a hacer secreto.
