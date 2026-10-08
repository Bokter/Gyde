# Flujos

Los diagramas muestran el comportamiento **objetivo** del MVP. Los pasos del Template Method del cliente (autenticar, parsear, vulnerabilidades, licencias, reporte, publicar) se corresponden con los mensajes numerados de abajo; ver [ADR 0004](../adr/0004-el-backend-orquesta-el-analisis.md).

## 1. Análisis completo (camino feliz)

```mermaid
sequenceDiagram
    autonumber
    actor U as CLI / Action / Extensión
    participant GW as Gateway
    participant WEB as Servicio Web
    participant REP as Reportes
    participant RET as Retrieval
    participant NORM as Normalización
    participant LLM as Análisis LLM

    U->>GW: GET /v1/auth/verify (API key)
    GW->>WEB: POST /internal/api-keys/verify
    WEB-->>GW: tenant y permisos
    GW-->>U: plan y permisos
    Note over U: Parseo local: solo nombres, versiones y licencias
    U->>GW: POST /v1/analyses (AnalysisRequest)
    GW->>REP: POST /internal/analyses
    REP-->>GW: 202 analysisId
    GW-->>U: 202 analysisId
    REP->>RET: POST /internal/retrieve
    RET->>NORM: POST /internal/knowledge/query
    NORM-->>RET: KnowledgeObjects
    Note over RET: Análisis determinístico: vulnerabilidades, licencias y compatibilidad
    RET->>REP: POST .../deterministic (DeterministicResult)
    RET->>LLM: POST /internal/analyze
    LLM->>WEB: GET /internal/tenants/:id/llm-config
    WEB-->>LLM: llave del estudio (en claro, solo red interna)
    Note over LLM: Proveedor de IA detrás de un Circuit Breaker por tenant y proveedor
    LLM->>REP: POST .../ai-result (AiResult)
    Note over REP: Compone el reporte con los decoradores que permite el plan
    loop hasta que el estado sea ready
        U->>GW: GET /v1/analyses/:id
        GW->>REP: GET /internal/analyses/:id
        REP-->>GW: Report
        GW-->>U: Report
    end
```

Estados del análisis: `pending → retrieving → analyzing → ready` (o `failed` si falla la recuperación). El cliente publica el resultado al terminar.

## 2. Resultado degradado (la IA falla o no está configurada)

```mermaid
sequenceDiagram
    participant RET as Retrieval
    participant LLM as Análisis LLM
    participant AI as Proveedor de IA
    participant REP as Reportes
    participant U as Cliente

    RET->>REP: resultado determinístico (ya disponible)
    RET->>LLM: evidencia
    LLM->>AI: solicitud con la llave del estudio
    AI --x LLM: timeout o error
    LLM->>AI: reintento
    AI --x LLM: timeout o error
    Note over LLM: Circuito abierto: umbral de fallos superado
    LLM->>REP: AnalysisFailure (llm-unavailable)
    Note over REP: ready + degraded, con hallazgos determinísticos
    U->>REP: pide el reporte (a través del gateway)
    REP-->>U: reporte degradado, sin explicación de IA
```

Un reporte es **degradado** solo si se esperaba IA y no pudo correr: `llm-unavailable` (circuito abierto o proveedor caído), `llm-not-configured` (el estudio aún no cargó su llave), `llm-error` (el proveedor respondió con error). Si el plan o el cliente no pidieron IA, el reporte **no** es degradado.

El cliente también degrada: si el gateway no responde, su Circuit Breaker sirve el último reporte guardado en la caché local, marcado como degradado.

## 3. Circuit Breaker

```mermaid
stateDiagram-v2
    [*] --> Cerrado
    Cerrado --> Abierto: 5 fallos seguidos o 50% en la ventana
    Abierto --> Semiabierto: pasa el tiempo de espera
    Semiabierto --> Cerrado: las llamadas de prueba funcionan
    Semiabierto --> Abierto: una prueba falla y se reinicia el temporizador
```

| Situación | Decisión (documento, tabla 3.3) |
|---|---|
| Los fallos superan el umbral (5 fallos o 50 % de las solicitudes en una ventana de tiempo) | Pasa a **abierto**: deja de llamar al servicio y responde de inmediato con el fallback (última respuesta cacheada o mensaje de análisis parcial) |
| Transcurre el tiempo de espera en abierto | Pasa a **semiabierto**: permite un número limitado de solicitudes de prueba |
| Las pruebas tienen éxito | Vuelve a **cerrado** y reanuda el tráfico normal |
| Las pruebas fallan | Vuelve a **abierto**, reiniciando el temporizador |
| El Health Checker detecta una instancia que no responde | El registry la elimina del listado |
| No hay ninguna instancia saludable | El cliente recibe un error controlado o un resultado degradado, sin bloquear el pipeline completo |

El breaker de las llamadas a proveedores de IA es **por tenant + proveedor**: con BYOK, un rate limit o una llave inválida de un estudio no debe abrir el circuito de los demás.

## 4. Registro y descubrimiento de servicios

```mermaid
sequenceDiagram
    participant S as Servicio (instancia)
    participant R as Service Registry
    participant H as Health Checker
    participant GW as Gateway

    S->>R: POST /v1/instances (se registra)
    loop cada HEARTBEAT_INTERVAL_MS
        S->>R: PUT /v1/instances/:id/heartbeat
    end
    loop cada HEALTH_CHECK_INTERVAL_MS
        H->>S: GET /healthz
    end
    Note over H,R: Tras HEALTH_CHECK_MAX_FAILURES fallos seguidos se elimina del registro
    GW->>R: GET /v1/services/reports
    R-->>GW: instancias saludables
    GW->>S: llamada a través del Circuit Breaker
```

Si el registry no responde, `@gyde/discovery` cae a las URLs estáticas del entorno (`*_URL`), de modo que el desarrollo local y un registry caído no detienen el sistema.

## 5. Suscripción con Stripe

```mermaid
sequenceDiagram
    actor E as Estudio
    participant WEB as Servicio Web
    participant ST as Stripe

    E->>WEB: elige un plan
    WEB->>ST: crea la sesión de Checkout
    ST-->>E: página de pago
    E->>ST: paga
    ST->>WEB: webhook (checkout.session.completed, customer.subscription.*)
    Note over WEB: verifica la firma, actualiza la suscripción y recalcula los Entitlements
    E->>WEB: gestiona o cancela desde el Portal de cliente
```

El webhook es la **única** fuente de verdad del estado de la suscripción; la UI nunca asume un pago por haber vuelto de Checkout. Se desarrolla solo con llaves de modo test.

## 6. Llave LLM del estudio (BYOK)

```mermaid
sequenceDiagram
    actor E as Estudio
    participant WEB as Servicio Web
    participant DB as PostgreSQL (schema web)
    participant LLM as Análisis LLM

    E->>WEB: guarda proveedor, modelo y llave
    WEB->>WEB: prueba la conexión con el proveedor
    WEB->>DB: guarda la llave cifrada (AES-256-GCM, kid)
    Note over LLM: más tarde, durante un análisis
    LLM->>WEB: GET /internal/tenants/:id/llm-config (token interno)
    WEB->>DB: lee y descifra
    WEB-->>LLM: configuración con la llave en claro
    Note over LLM: usa la llave en memoria durante la llamada y la descarta
```

Controles y modelo de amenazas en [04 Datos, privacidad y seguridad](04-datos-privacidad-seguridad.md).
