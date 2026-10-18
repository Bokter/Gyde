/** Base of every normalization application error: a stable `code`, never an HTTP status. */
export class NormalizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownSourceError extends NormalizationError {
  constructor(readonly source: string) {
    super('unknown_source', `Unknown source "${source}"`);
  }
}

export class IngestionInProgressError extends NormalizationError {
  constructor(readonly source: string) {
    super('ingestion_in_progress', `Source "${source}" is already being ingested`);
  }
}

/** The source could not be read or stored. The attempt is recorded; stored knowledge is untouched. */
export class IngestionFailedError extends NormalizationError {
  constructor(
    readonly source: string,
    reason: string,
  ) {
    super('ingestion_failed', `Ingestion of "${source}" failed: ${reason}`);
  }
}
