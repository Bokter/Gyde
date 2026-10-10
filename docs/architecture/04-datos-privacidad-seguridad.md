# Datos, privacidad y seguridad

## 1. Qué sale del entorno del cliente

La propuesta de valor incluye proteger el código propietario: el análisis empieza **localmente** (CLI, Action o extensión) y al backend solo viaja información no sensible.

| Permitido (`AnalysisRequest`) | Prohibido |
|---|---|
| Nombre, versión, ecosistema y licencia declarada de cada dependencia | Código fuente, fragmentos o diffs |
| Motor, versión del motor, SDKs y plataformas objetivo | Rutas de archivos o nombres de carpetas del proyecto |
| Tipo y versión del cliente (CLI / Action / extensión) | URL del repositorio, nombres de ramas, usuarios, equipos |
| Opciones del análisis (`includeAi`) | Cualquier otro dato |

**Cómo se impone (defensa en profundidad):**

1. `buildAnalysisRequest()` en el cliente copia una **lista explícita de campos**; aunque un parser adjunte algo por error, no sale.
2. `AnalysisRequest` en `@gyde/contracts` es `strictObject`: cualquier campo desconocido se rechaza con `400`.
3. `test/privacy.test.ts` (contratos y motor) falla si el esquema se vuelve más permisivo.
4. El gateway y los servicios **no registran** el cuerpo de las solicitudes.

## 2. Quién guarda qué

Una instancia de PostgreSQL, **un schema y un rol por servicio que persiste**, sin acceso cruzado.

| Servicio | Schema | Qué guarda |
|---|---|---|
| `web` | `web` | usuarios, tenants, suscripción, API keys (**hash**), configuración LLM (**cifrada**) |
| `normalization` | `normalization` | `KnowledgeObject` y estado de las ingestas |
| `reports` | `reports` | análisis y reportes |
| `gateway`, `retrieval`, `llm-analysis`, `registry` | — | sin persistencia (caché en memoria) |

Los reportes contienen nombres de dependencias y hallazgos, no código del cliente. La política de retención queda fuera del camino E2E del MVP: por defecto se conservan según el plan y, si se implementa, es una constante documentada en `reports` (Área 4), no una función nueva.

## 3. Llaves LLM de los estudios (BYOK)

Cada estudio carga la llave de su propio proveedor de IA. Es el dato más sensible que custodia Gyde.

| Control | Detalle |
|---|---|
| **Cifrado en reposo** | AES-256-GCM. Claves maestras versionadas por `kid` (`LLM_KEY_ENCRYPTION_KEYS`, `LLM_KEY_ACTIVE_KID`) para poder rotar sin perder las llaves antiguas |
| **Solo escritura desde la UI** | La llave en claro nunca vuelve al navegador; solo se muestran los últimos 4 caracteres (`keyLast4`) |
| **Prueba antes de guardar** | Se valida contra el proveedor; así se detectan llaves erróneas desde el primer momento |
| **Un único camino de salida** | `GET /internal/tenants/:id/llm-config`, solo hacia llm-analysis, con token interno, **fuera del gateway** |
| **En memoria, por llamada** | llm-analysis la usa durante la llamada y la descarta (caché de ~1 minuto como máximo y solo en memoria) |
| **Nunca en logs** | `@gyde/service-kit` censura `apiKey`, `authorization`, `token`, `password`, `secret`…; además, no se interpolan secretos en mensajes |
| **Aislamiento de fallos** | Circuit Breaker por tenant + proveedor |
| **Rotación y revocación** | El estudio puede reemplazarla o revocarla; la rotación de claves maestras está soportada por `kid` |

## 4. Autenticación y autorización

| Frontera | Mecanismo |
|---|---|
| Cliente → gateway | API key (`Authorization: Bearer`), emitida por web, guardada como **hash**, con prefijo (`gyde_live_` / `gyde_test_`) y mostrada una sola vez |
| Gateway → servicios | `x-internal-token` (`INTERNAL_SERVICE_TOKEN`), comparación en tiempo constante. `/internal/*` **nunca** se enruta desde el gateway |
| Servicios → registry | El mismo token interno en todas las rutas `/v1/*` del registry |
| Stripe → web | Firma del webhook verificada con `STRIPE_WEBHOOK_SECRET` |
| Usuarios → web | Inicio de sesión con GitHub (OAuth); sin contraseñas propias |

Los **permisos** (`Entitlements`) se resuelven una vez en el gateway a partir de la API key y viajan en el cuerpo de las llamadas internas; los servicios leen permisos, no nombres de plan.

## 5. Modelo de amenazas (resumen)

| Amenaza | Mitigación |
|---|---|
| Un cliente envía código fuente por error | Allow-list en el cliente + esquema estricto + pruebas |
| Robo de una API key | Se guarda solo el hash; se puede revocar; límite de tasa por key |
| Fuga de la llave LLM por logs o errores | Censura de campos, regla de no interpolar secretos, revisión en PR |
| Abuso de `/internal/*` desde fuera | No se enruta por el gateway + token interno + red privada en compose |
| Un estudio con llave inválida degrada a los demás | Breaker por tenant + proveedor |
| Salida del LLM no confiable (prompt injection vía datos de comunidad) | Validación con el esquema `AiResult`; nunca se ejecuta lo que devuelve el modelo; las fuentes de comunidad tienen confianza baja |
| Fuente externa maliciosa o corrupta | Esquema común validado, confianza por nivel, aislamiento por fuente |
| Webhook de Stripe falsificado | Verificación de firma y procesamiento idempotente |

## 6. Secretos y entorno

- `.env` está ignorado por git; `.env.example` solo lleva placeholders.
- Stripe: **únicamente llaves de modo test** durante el desarrollo.
- Si un secreto llega al repositorio por error, se **revoca** de inmediato (borrarlo del historial no basta).
- Reporte de vulnerabilidades del propio Gyde: ver `SECURITY.md`.
