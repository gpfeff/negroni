const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{12,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*\S+/i,
];

const SECRET_QUERY_KEY =
  /(?:^|[-_])(?:key|api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|signature|credential|password|sig)(?:$|[-_])/i;

function secretBearingKey(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return /^(?:apikey|accesstoken|refreshtoken|password|secret|clientsecret|credential|credentials)$/.test(
    normalized,
  );
}

export function containsSecretLikeValue(value) {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function urlContainsSecretLikeQuery(value) {
  try {
    const url = new URL(value);
    return (
      Boolean(url.username || url.password) ||
      [...url.searchParams.keys()].some((key) => SECRET_QUERY_KEY.test(key))
    );
  } catch {
    return false;
  }
}

export function containsSecretMaterial(value) {
  if (typeof value === "string") {
    return containsSecretLikeValue(value) || urlContainsSecretLikeQuery(value);
  }
  if (Array.isArray(value)) return value.some(containsSecretMaterial);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(
    ([key, child]) => secretBearingKey(key) || containsSecretMaterial(child),
  );
}

export function assertNoSecretMaterial(value, context) {
  if (containsSecretMaterial(value)) {
    throw new Error(
      `${context} contains a credential-like key, token, password, or signed URL. Remove it before saving or exporting.`,
    );
  }
}
