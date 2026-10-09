export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown, max = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function requireNonEmptyString(value: unknown, label: string, max = 4096): string {
  if (!isNonEmptyString(value, max)) throw new Error(`Invalid ${label}.`);
  return value;
}
