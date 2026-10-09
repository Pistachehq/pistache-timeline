import {
  err,
  isTimelineError,
  ok,
  PROJECT_FORMAT_ID,
  type Result,
  TimelineError,
  toErrorMessage,
} from '@timeline/shared';
import { CURRENT_SCHEMA_VERSION } from '../model/defaults';
import { validateProjectInvariants } from '../model/invariants';
import { type Project } from '../model/types';
import { migrateProject, type MigrationRegistry, MIGRATIONS } from './migrations';
import { parseProject } from './parse-project';
import { isObject } from './reader';

/** On-disk envelope of a project file. */
export interface ProjectFile {
  readonly format: typeof PROJECT_FORMAT_ID;
  readonly generator: string;
  readonly project: Project;
}

export interface SerializeOptions {
  readonly generator?: string;
  readonly pretty?: boolean;
}

export function serializeProject(project: Project, options: SerializeOptions = {}): string {
  const file: ProjectFile = {
    format: PROJECT_FORMAT_ID,
    generator: options.generator ?? 'Timeline',
    project: { ...project, schemaVersion: CURRENT_SCHEMA_VERSION },
  };
  return JSON.stringify(file, null, options.pretty === false ? undefined : 2);
}

export interface DeserializeOptions {
  readonly migrations?: MigrationRegistry;
}

/**
 * Parses, migrates and validates a project file. Never throws for malformed
 * input; returns a descriptive error instead.
 */
export function deserializeProject(text: string, options: DeserializeOptions = {}): Result<Project, TimelineError> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return err(new TimelineError('INVALID_PROJECT', 'The file is not valid JSON.', { cause }));
  }

  try {
    if (!isObject(raw) || raw.format !== PROJECT_FORMAT_ID) {
      return err(new TimelineError('INVALID_PROJECT', 'The file is not a Timeline project.'));
    }
    if (!isObject(raw.project)) {
      return err(new TimelineError('INVALID_PROJECT', 'The project file has no project data.'));
    }
    const version = raw.project.schemaVersion;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return err(new TimelineError('INVALID_PROJECT', 'The project file has an invalid schema version.'));
    }
    if (version > CURRENT_SCHEMA_VERSION) {
      return err(
        new TimelineError(
          'UNSUPPORTED_VERSION',
          `This project was created by a newer version of Timeline (schema ${version}). Please update Timeline.`,
        ),
      );
    }

    const migrated = migrateProject(raw.project, version, options.migrations ?? MIGRATIONS);
    const project = parseProject(migrated);
    const issues = validateProjectInvariants(project);
    if (issues.length > 0) {
      return err(new TimelineError('INVALID_PROJECT', `The project is inconsistent: ${issues.slice(0, 3).join('; ')}.`));
    }
    return ok(project);
  } catch (cause) {
    if (isTimelineError(cause)) return err(cause);
    return err(new TimelineError('INVALID_PROJECT', toErrorMessage(cause), { cause }));
  }
}

/**
 * Leniently extracts the media path hints from a project file without full
 * validation. The desktop main process uses this to decide which files an
 * opened project may grant access to.
 */
export function collectMediaPaths(text: string): string[] {
  try {
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw) || !isObject(raw.project) || !isObject(raw.project.mediaAssets)) return [];
    const paths: string[] = [];
    for (const asset of Object.values(raw.project.mediaAssets)) {
      if (isObject(asset) && isObject(asset.source) && typeof asset.source.path === 'string') {
        paths.push(asset.source.path);
      }
    }
    return paths;
  } catch {
    return [];
  }
}
