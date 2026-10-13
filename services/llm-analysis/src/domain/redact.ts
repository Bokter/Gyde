/**
 * Removes known secrets from any text that is about to leave this service: an error message, a
 * log line, a published `AnalysisFailure`. A secret hidden inside a string cannot be detected
 * generically, so every message built from an upstream answer or an exception goes through here.
 */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let safe = text;
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('[REDACTED]');
  }
  return safe;
}

/** Keeps a message inside the limit of `AnalysisFailure.message` (1000 characters). */
export function truncateMessage(text: string, max = 1000): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
