/** Base of every reports application error: carries a stable `code`, never an HTTP status. */
export class ReportsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The analysis does not exist, or belongs to another tenant: both answer the same on purpose, so
 * nobody can tell a foreign id from a missing one.
 */
export class AnalysisNotFoundError extends ReportsError {
  constructor(analysisId: string) {
    super('analysis_not_found', `Analysis ${analysisId} was not found`);
  }
}
