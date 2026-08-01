const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function safeServiceUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const allowed = url.protocol === "https:"
      || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
    if (!allowed || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function safeServiceEndpoint(value: string, path: string): URL | null {
  const base = safeServiceUrl(value);
  return base ? new URL(path, base) : null;
}
