/**
 * Injection token of the validated configuration of a service (the output of `loadConfig`).
 * `createService` provides it globally when you pass `config`; read it only from the composition
 * root (`app.module.ts`) or from `infrastructure/`, never from `domain/` or `application/`.
 */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Options of the health module (service identity and readiness checks). */
export const HEALTH_OPTIONS = Symbol('HEALTH_OPTIONS');
