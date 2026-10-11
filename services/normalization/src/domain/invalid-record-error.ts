/**
 * A raw record that does not have the shape its source promises. The ingestion of a source
 * isolates it (the rest of the source keeps going); the message never carries record contents.
 */
export class InvalidRecordError extends Error {
  constructor(
    readonly source: string,
    readonly sourceId: string,
    detail: string,
  ) {
    super(`Invalid ${source} record "${sourceId}": ${detail}`);
    this.name = 'InvalidRecordError';
  }
}
