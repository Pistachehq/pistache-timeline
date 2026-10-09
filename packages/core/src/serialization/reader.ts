import { TimelineError } from '@timeline/shared';

/*
 * Minimal typed readers for validating untrusted JSON. Each reader throws a
 * TimelineError that includes the JSON path of the offending value.
 */

export type JsonObject = Record<string, unknown>;

export function invalid(path: string, expected: string): TimelineError {
  return new TimelineError('INVALID_PROJECT', `Invalid project file: ${path} must be ${expected}.`);
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) throw invalid(path, 'an object');
  return value;
}

export function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(path, 'an array');
  return value;
}

export function readString(obj: JsonObject, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== 'string') throw invalid(`${path}.${key}`, 'a string');
  return value;
}

export function readNullableString(obj: JsonObject, key: string, path: string): string | null {
  const value = obj[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalid(`${path}.${key}`, 'a string or null');
  return value;
}

export function readBoolean(obj: JsonObject, key: string, path: string): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') throw invalid(`${path}.${key}`, 'a boolean');
  return value;
}

export function readNumber(obj: JsonObject, key: string, path: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${path}.${key}`, 'a finite number');
  return value;
}

export function readInteger(obj: JsonObject, key: string, path: string, min = 0): number {
  const value = readNumber(obj, key, path);
  if (!Number.isInteger(value) || value < min) throw invalid(`${path}.${key}`, `an integer ≥ ${min}`);
  return value;
}

export function readEnum<T extends string>(obj: JsonObject, key: string, path: string, values: readonly T[]): T {
  const value = obj[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw invalid(`${path}.${key}`, `one of ${values.join(', ')}`);
  }
  return value as T;
}
