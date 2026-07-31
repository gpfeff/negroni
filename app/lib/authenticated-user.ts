const LOCAL_OWNER = "local-preview";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function authenticatedOwner(request: Request): string | null {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const trustedSuffix = process.env.NEGRONI_TRUSTED_INGRESS_SUFFIX?.trim().toLowerCase() || ".chatgpt.site";
  const trustedIngress = trustedSuffix.startsWith(".") && hostname.endsWith(trustedSuffix) && hostname.length > trustedSuffix.length;
  if ((trustedIngress || isLocalHostname(hostname)) && email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  return isLocalHostname(hostname) ? LOCAL_OWNER : null;
}
