export function containsSecretLikeValue(value: string): boolean;
export function urlContainsSecretLikeQuery(value: string): boolean;
export function containsSecretMaterial(value: unknown): boolean;
export function assertNoSecretMaterial(
  value: unknown,
  context: string,
): asserts value;
