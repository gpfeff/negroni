export const EXAMPLE_ONLY_TERMS: readonly string[];
export function scanForExampleLeaks(value: unknown): {
  passed: boolean;
  matches: string[];
};
