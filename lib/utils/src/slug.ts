import { shortId } from "./id";

export interface SlugifyOptions {
  /** Max length of the produced slug. Default 48. */
  maxLength?: number;
  /** Returned when the input has no slug-able characters. Default "item". */
  fallback?: string;
}

/**
 * Turn arbitrary text into a lowercase, hyphenated, URL-safe slug. Strips
 * diacritics, collapses runs of non-alphanumerics into single hyphens, and trims
 * leading/trailing hyphens. Returns `fallback` if nothing slug-able remains.
 */
export function slugify(input: string, opts: SlugifyOptions = {}): string {
  const { maxLength = 48, fallback = "item" } = opts;
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, ""); // trim a trailing hyphen left behind by the slice
  return slug || fallback;
}

/**
 * Produce a unique slug for `base`. Tries the plain slug first; on collision (as
 * reported by the injected `exists` predicate) appends a short random suffix and
 * retries. The uniqueness source — a DB, a Set, anything — is the caller's concern,
 * which keeps this function pure and reusable across backend and frontend.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => boolean | Promise<boolean>,
  opts: SlugifyOptions & { maxAttempts?: number } = {},
): Promise<string> {
  const { maxAttempts = 25, ...slugOpts } = opts;
  const root = slugify(base, slugOpts);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${shortId(6)}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Exhausted attempts (astronomically unlikely): fall back to a fully random tail.
  return `${root}-${shortId(12)}`;
}
