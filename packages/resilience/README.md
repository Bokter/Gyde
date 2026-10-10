# @gyde/resilience

Patrón arquitectónico **Circuit Breaker** + **caché local / fallback** (documento de arquitectura, patrón 1). Es la librería que envuelve **toda llamada saliente** de Gyde para que un proveedor lento o caído no arrastre a los demás ni congele el CI de un cliente.

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

## Uso real

```ts
import {
  CircuitBreaker,
  MemoryFallbackCache,
  createBreakerFromEnv,
} from '@gyde/resilience';

// 1. Create once per dependency (not per request).
const cache = new MemoryFallbackCache<AiResult>({ maxEntries: 500 });

// 2. Read CB_* from the environment.
const breaker = new CircuitBreaker(createBreakerFromEnv('retrieval->llm-analysis'));

// 3. Wrap every outgoing call.
const result = await breaker.execute(
  async () => {
    const fresh = await llmClient.analyze(request);
    await cache.set(tenantKey, fresh);
    return fresh;
  },
  {
    fallback: async () => {
      const entry = await cache.get(tenantKey);
      return entry
        ? { ...entry.value, degraded: true }   // mark as degraded so caller knows
        : defaultDegradedResult;
    },
  },
);
```

### `createBreakerFromEnv(name, env?)`

Lee las variables `CB_*` del entorno y devuelve un `CircuitBreakerOptions` completo.
El argumento `env` es opcional y permite inyectar valores en pruebas sin tocar `process.env`.

```ts
// En tests:
const opts = createBreakerFromEnv('my-dep', {
  CB_FAILURE_THRESHOLD: '2',
  CB_OPEN_TIMEOUT_MS: '1000',
});
```

### `MemoryFallbackCache` (LRU + TTL, para servicios)

```ts
const cache = new MemoryFallbackCache<string>({
  maxEntries: 100,   // evicts LRU when exceeded
  ttlMs: 60_000,     // entries older than 1 min are ignored
});
await cache.set('key', 'value');
const entry = await cache.get('key'); // { value: 'value', storedAt: 1234567890 }
```

### `FileFallbackCache` (persiste entre reinicios, para el CLI / GitHub Action)

```ts
const cache = new FileFallbackCache<Report>({
  directory: join(homedir(), '.gyde', 'cache'),
  ttlMs: 24 * 60 * 60_000,  // 24 h
});
await cache.set('last-report', report);
// Next run:
const cached = await cache.get('last-report');
```

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

## Criterios de aceptación

Todos los `it.todo` de `test/circuit-breaker.test.ts` fueron convertidos en pruebas reales y verdes. El reloj es inyectable (`now`) para que ninguna prueba use timers reales.
