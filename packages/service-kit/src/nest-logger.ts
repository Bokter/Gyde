import type { LoggerService } from '@nestjs/common';

import type { Logger } from './logger';

/** Sends NestJS's own logs (startup, routes, errors) through the redacting pino logger. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...optional: unknown[]): void {
    this.logger.info(this.fields(optional), this.text(message));
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.logger.error(this.fields(optional), this.text(message));
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.logger.warn(this.fields(optional), this.text(message));
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.logger.debug(this.fields(optional), this.text(message));
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.logger.trace(this.fields(optional), this.text(message));
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    this.logger.fatal(this.fields(optional), this.text(message));
  }

  private text(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }

  /** Nest passes the logging context (the class name) as the last string argument. */
  private fields(optional: unknown[]): { context?: string } {
    const last = optional.at(-1);
    return typeof last === 'string' ? { context: last } : {};
  }
}
