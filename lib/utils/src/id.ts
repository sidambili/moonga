/**
 * Random identifier helpers.
 *
 * Isomorphic: these use the Web Crypto API (`globalThis.crypto`), which is a global
 * in browsers and in Node 19+, so this module is safe to import from both the
 * frontend and the backend.
 */

/** Cryptographically-random UUID v4. Use for primary keys and other unique ids. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Short random token (hex chars, no dashes). Handy for disambiguating slugs or
 * other human-facing identifiers. Defaults to 8 chars; capped at 32.
 */
export function shortId(length = 8): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, Math.min(length, 32));
}
