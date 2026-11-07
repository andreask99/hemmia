const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The first configured public hostname (the tailnet name), or null. */
export function publicHost(allowedHosts: readonly string[]): string | null {
  return allowedHosts.find((h) => !LOCAL.has(h)) ?? null;
}

/** The URL family members use: https://<tailnet name>, or the dev server if none is set. */
export function publicBaseUrl(allowedHosts: readonly string[]): string {
  const host = allowedHosts.find((h) => !LOCAL.has(h));
  return host ? `https://${host}` : 'http://localhost:5173';
}
