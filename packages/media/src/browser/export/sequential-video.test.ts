import { describe, expect, it } from 'vitest';
import { nextSampleAction, SequentialFrameSource, type HeldVideoFrame, type VideoFrameSink } from './sequential-video';

function frame(timestamp: number): HeldVideoFrame {
  return {
    timestamp,
    duration: 1 / 30,
    displayWidth: 4,
    displayHeight: 4,
    draw() {},
    close() {},
  };
}

class FakeSink implements VideoFrameSink {
  gets: number[] = [];
  readonly frames = [0, 1 / 30, 2 / 30, 3 / 30].map((timestamp) => frame(timestamp));

  async getSample(timestamp: number): Promise<HeldVideoFrame | null> {
    this.gets.push(timestamp);
    const hit = [...this.frames].reverse().find((item) => item.timestamp <= timestamp + 1e-6);
    return hit ? frame(hit.timestamp) : null;
  }

  samples(startTimestamp = 0): AsyncIterable<HeldVideoFrame> {
    const frames = this.frames.filter((item) => item.timestamp + 1e-6 >= startTimestamp);
    return {
      async *[Symbol.asyncIterator]() {
        for (const item of frames) yield frame(item.timestamp);
      },
    };
  }
}

describe('nextSampleAction', () => {
  it('holds a frame that still covers the target', () => {
    expect(nextSampleAction({ timestamp: 0, duration: 0.1 }, 0.05)).toBe('hold');
  });

  it('restarts when the playhead jumps backward or far ahead', () => {
    expect(nextSampleAction({ timestamp: 2, duration: 0.03 }, 1)).toBe('restart');
    expect(nextSampleAction({ timestamp: 0, duration: 0.03 }, 2)).toBe('restart');
  });
});

describe('SequentialFrameSource', () => {
  it('decodes forward without seeking again on each frame', async () => {
    const sink = new FakeSink();
    const source = new SequentialFrameSource(sink, () => undefined);
    const first = await source.frameAt(0.01);
    const second = await source.frameAt(1 / 30 + 0.001);
    const third = await source.frameAt(2 / 30 + 0.001);
    expect(first?.timestamp).toBe(0);
    expect(second?.timestamp).toBeCloseTo(1 / 30);
    expect(third?.timestamp).toBeCloseTo(2 / 30);
    expect(sink.gets).toEqual([0.01]);
    source.close();
  });

  it('seeks when the timestamp jumps ahead', async () => {
    const sink = new FakeSink();
    const source = new SequentialFrameSource(sink, () => undefined);
    await source.frameAt(0);
    await source.frameAt(5);
    expect(sink.gets.length).toBe(2);
    expect(sink.gets[1]).toBe(5);
    source.close();
  });
});
