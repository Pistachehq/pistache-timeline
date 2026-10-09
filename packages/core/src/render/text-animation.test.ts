import { describe, expect, it } from 'vitest';
import { addTextClip } from '../operations/clips';
import { setupProject } from '../test/fixtures';
import { unwrap } from '@timeline/shared';
import { buildTypewriterScript, textAnimationFrame, textAnimationProgress } from './text-animation';

describe('text animation', () => {
  it('types a string and holds the finished word', () => {
    const script = buildTypewriterScript('Hi', false);
    expect(script[0]).toBe('');
    expect(script.at(-1)).toBe('Hi');
    const early = textAnimationFrame('Hi', 'typewriter', 0);
    const late = textAnimationFrame('Hi', 'typewriter', 1);
    expect(early.runs[0]?.text.length).toBeLessThan('Hi'.length);
    expect(late.runs[0]?.text).toBe('Hi');
    expect(late.caret).toBe(false);
  });

  it('spreads typing across the whole duration the user set', () => {
    const content = 'Hello world, this is longer';
    const early = textAnimationFrame(content, 'typewriter', 0.72);
    expect(early.runs[0]?.text).not.toBe(content);
    expect(early.caret).toBe(true);
    const done = textAnimationFrame(content, 'typewriter', 1);
    expect(done.runs[0]?.text).toBe(content);
    expect(done.caret).toBe(false);

    const atTenFramesShort = textAnimationFrame(content, 'typewriter', textAnimationProgress(10, 30));
    const atTenFramesLong = textAnimationFrame(content, 'typewriter', textAnimationProgress(10, 180));
    expect(atTenFramesLong.runs[0]?.text.length ?? 0).toBeLessThan(atTenFramesShort.runs[0]?.text.length ?? 0);
  });

  it('keeps other reveals unfinished until the end of the duration', () => {
    const mid = textAnimationFrame('Hello world', 'word-fade', 0.5);
    const last = mid.runs.at(-1);
    expect(last?.opacity ?? 1).toBeLessThan(1);
    const done = textAnimationFrame('Hello world', 'word-fade', 1);
    expect(done.runs.every((run) => run.opacity === 1)).toBe(true);
  });

  it('corrects a typo by deleting a character', () => {
    const script = buildTypewriterScript('Hello', true);
    expect(script.at(-1)).toBe('Hello');
    const dipped = script.some((frame, index) => index > 0 && frame.length < script[index - 1]!.length);
    expect(dipped).toBe(true);
  });
});

describe('addTextClip', () => {
  it('places a text clip on a video track without a media asset', () => {
    const { project, sequence } = setupProject();
    const track = sequence.videoTracks[0]!;
    const next = unwrap(
      addTextClip(project, {
        sequenceId: sequence.id,
        trackId: track.id,
        start: 10,
        durationFrames: 90,
        content: 'Title',
        positionX: 12,
        positionY: -8,
      }),
    );
    const clip = Object.values(next.sequences[sequence.id]!.clips).find((item) => item.text);
    expect(clip?.assetId).toBeNull();
    expect(clip?.text?.content).toBe('Title');
    expect(clip?.text?.animation).toBe('none');
    expect(clip?.name).toBe('Title');
    expect(clip?.start).toBe(10);
    expect(clip?.sourceOut).toBe(90);
    expect(clip?.transform.positionX).toBe(12);
    expect(Object.keys(next.mediaAssets)).toEqual(Object.keys(project.mediaAssets));
  });
});
