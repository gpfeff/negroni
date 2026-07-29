const LOCAL_OWNER = "local-preview";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function authenticatedOwner(request: Request): string | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  return isLocalHostname(new URL(request.url).hostname) ? LOCAL_OWNER : null;
}
