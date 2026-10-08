# @gyde/resilience

Patrón arquitectónico **Circuit Breaker** + **caché local / fallback** (documento de arquitectura, patrón 1). Es la librería que envuelve **toda llamada saliente** de Gyde para que un proveedor lento o caído no arrastre a los demás ni congele el CI de un cliente.

> **Estado:** API tipada y criterios de aceptación como pruebas pendientes (`it.todo`). La implementación es del **Área 1** (`docs/tasks/area-1-plataforma-y-borde.md`).

## Máquina de estados

```
CERRADO ──(5 fallos seguidos o 50 % de fallos en la ventana)──▶ ABIERTO
ABIERTO ──(pasa el tiempo de espera)──▶ SEMIABIERTO (pocas llamadas de prueba)
SEMIABIERTO ──(las pruebas funcionan)──▶ CERRADO
SEMIABIERTO ──(una prueba falla)──▶ ABIERTO (reinicia el temporizador)
```

Mientras está **abierto** responde de inmediato con el *fallback* (última respuesta cacheada o resultado parcial) y **no llama** a la dependencia.

Parámetros por defecto, leídos del entorno (ver `.env.example`):

| Variable | Valor | Significado |
|---|---|---|
| `CB_FAILURE_THRESHOLD` | 5 | Fallos consecutivos para abrir |
| `CB_FAILURE_RATE` | 0.5 | Proporción de fallos en la ventana para abrir |
| `CB_WINDOW_MS` | 30000 | Ventana deslizante |
| `CB_OPEN_TIMEOUT_MS` | 15000 | Tiempo abierto antes de probar |
| `CB_HALF_OPEN_MAX_CALLS` | 2 | Llamadas de prueba en semiabierto |
| `CB_CALL_TIMEOUT_MS` | 10000 | Una llamada más lenta cuenta como fallo |

## Dónde se usa (un breaker por dependencia)

| Llamada saliente | Fallback esperado |
|---|---|
| CLI / Action → Gateway | Último reporte cacheado en disco → resultado **degradado** |
| Gateway → Web / Reports | Error controlado (`upstream_unavailable`) |
| Reports → Retrieval | Reporte fallido con motivo claro |
| Retrieval → Normalization | Conocimiento en caché; `partialSources: true` |
| Retrieval → llm-analysis | Seguir solo con el resultado determinístico |
| llm-analysis → proveedores de IA | Última clasificación cacheada / `llm-unavailable`. **Un breaker por tenant + proveedor** (BYOK) |
| Normalization → fuentes externas | Servir conocimiento previo |
| Web → Stripe | Reintentar luego; no bloquear la UI |

## Uso previsto

```ts
const breaker = new CircuitBreaker({ name: 'retrieval->llm-analysis', ...defaultsFromEnv });
const cache = new MemoryFallbackCache<AiResult>({ maxEntries: 500 });

const result = await breaker.execute(
  async () => {
    const fresh = await client.analyze(request);
    await cache.set(key, fresh);
    return fresh;
  },
  { fallback: async () => (await cache.get(key))?.value ?? degradedResult },
);
```

## Criterios de aceptación

Están como `it.todo` en `test/circuit-breaker.test.ts`, tomados de la tabla 3.3 y de los diagramas de secuencia (éxito y error). Conviértelos en pruebas reales con el reloj inyectable `now`.
