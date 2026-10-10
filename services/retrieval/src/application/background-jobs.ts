/**
 * Runs work after the HTTP response has been sent (`POST /internal/retrieve` answers 202 at once).
 * It keeps track of what is running so a shutdown, or a test, can wait for it.
 */
export class BackgroundJobs {
  private readonly running = new Set<Promise<void>>();

  /** Starts `task` and returns immediately. A rejection is handed to `onError`, never thrown. */
  run(task: () => Promise<void>, onError: (error: unknown) => void): void {
    const job: Promise<void> = Promise.resolve()
      .then(task)
      .catch(onError)
      .finally(() => this.running.delete(job));
    this.running.add(job);
  }

  /** Resolves when everything started so far has finished. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }
}
