import { createProject, getActiveSequence } from '@timeline/core';
import { describe, expect, it } from 'vitest';
import {
  buildExportOutput,
  linkedExportDimension,
  previewLinkedDimension,
  snapExportDimension,
} from './export-presets';

describe('export resolution', () => {
  it('snaps dimensions to even pixels inside the encoder range', () => {
    expect(snapExportDimension(1921)).toBe(1922);
    expect(snapExportDimension(1919)).toBe(1920);
    expect(snapExportDimension(3)).toBe(16);
    expect(snapExportDimension(9000)).toBe(7680);
  });

  it('keeps 16:9 when one side changes', () => {
    const aspect = 1920 / 1080;
    expect(previewLinkedDimension(1280, aspect, 'width')).toBe(720);
    expect(linkedExportDimension(1000, aspect, 'width')).toBe(564);
    expect(previewLinkedDimension(1080, aspect, 'height')).toBe(1920);
  });

  it('uses the typed size for a custom export', () => {
    const project = createProject({ now: new Date('2026-01-01T00:00:00Z') });
    const sequence = getActiveSequence(project);
    if (!sequence) throw new Error('missing sequence');
    expect(buildExportOutput(sequence, 'custom', 1080, 1920, 'sequence')).toMatchObject({
      width: 1080,
      height: 1920,
    });
    expect(buildExportOutput(sequence, '1080x1080', 100, 100, '30')).toMatchObject({
      width: 1080,
      height: 1080,
    });
  });
});
