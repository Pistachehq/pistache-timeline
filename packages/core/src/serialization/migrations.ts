import { TimelineError } from '@timeline/shared';
import { CURRENT_SCHEMA_VERSION } from '../model/defaults';
import { type JsonObject } from './reader';

/**
 * A migration upgrades the raw JSON of a project from version `n` to `n + 1`.
 * Migrations operate on untyped JSON because old shapes no longer match the
 * current TypeScript types. Register a migration whenever the persisted
 * schema changes and bump `CURRENT_SCHEMA_VERSION`.
 */
export type Migration = (project: JsonObject) => JsonObject;

export type MigrationRegistry = Readonly<Record<number, Migration>>;

/** Migrations keyed by the version they upgrade *from*. Empty for schema v1. */
export const MIGRATIONS: MigrationRegistry = {};

export function migrateProject(
  project: JsonObject,
  fromVersion: number,
  migrations: MigrationRegistry = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): JsonObject {
  let current = project;
  for (let version = fromVersion; version < targetVersion; version++) {
    const migration = migrations[version];
    if (!migration) {
      throw new TimelineError('UNSUPPORTED_VERSION', `No migration available from schema version ${version}.`);
    }
    current = { ...migration(current), schemaVersion: version + 1 };
  }
  return current;
}
