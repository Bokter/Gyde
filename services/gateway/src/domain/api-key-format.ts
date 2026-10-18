/** Length bounds of an API key; the same ones the contract (`VerifyApiKeyRequest`) puts on it. */
export const API_KEY_MIN_LENGTH = 10;
export const API_KEY_MAX_LENGTH = 200;

/**
 * Whether a presented key is worth asking Web about: a key outside the bounds cannot exist.
 * The length is counted in Unicode code points, like the contract's schema does (a character
 * outside the BMP counts once, not as its two UTF-16 units).
 */
export function isWellFormedApiKey(value: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  const length = [...value].length;
  return length >= API_KEY_MIN_LENGTH && length <= API_KEY_MAX_LENGTH;
}
