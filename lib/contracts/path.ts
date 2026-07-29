export function getAtPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object") {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

export function setAtPath<T>(root: T, path: string, value: unknown): T {
  const clone = structuredClone(root);
  const keys = path.split(".");
  let cursor = clone as Record<string, unknown>;

  keys.slice(0, -1).forEach((key) => {
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys.at(-1)!] = value;
  return clone;
}

export function toList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function fromList(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
