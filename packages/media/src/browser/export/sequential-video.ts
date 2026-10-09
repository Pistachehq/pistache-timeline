/** How to reach `targetSeconds` from the frame currently held by a sequential decoder. */
export function nextSampleAction(
  current: { readonly timestamp: number; readonly duration: number } | null,
  targetSeconds: number,
): 'hold' | 'advance' | 'restart' {
  if (!current) return 'restart';
  const duration = current.duration > 0 ? current.duration : 1 / 60;
  const end = current.timestamp + duration;
  if (targetSeconds + 1e-3 < current.timestamp) return 'restart';
  // A long jump forward would decode every frame in between. Seek instead.
  if (targetSeconds > end + 0.75) return 'restart';
  if (targetSeconds < end - 1e-4) return 'hold';
  return 'advance';
}

export interface HeldVideoFrame {
  readonly timestamp: number;
  readonly duration: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
  close(): void;
}

export interface VideoFrameSink {
  getSample(timestamp: number): Promise<HeldVideoFrame | null>;
  samples(startTimestamp?: number): AsyncIterable<HeldVideoFrame>;
}

/**
 * Decodes forward from the last frame. A timeline that plays in order hits each
 * packet once; a cut backward or a long jump seeks again.
 */
export class SequentialFrameSource {
  #sink: VideoFrameSink;
  #release: () => void;
  #iter: AsyncIterator<HeldVideoFrame> | null = null;
  #sample: HeldVideoFrame | null = null;
  #closed = false;

  constructor(sink: VideoFrameSink, release: () => void) {
    this.#sink = sink;
    this.#release = release;
  }

  async frameAt(seconds: number): Promise<HeldVideoFrame | null> {
    if (this.#closed) return null;
    const action = nextSampleAction(this.#sample, seconds);
    if (action === 'hold') return this.#sample;
    if (action === 'restart') await this.#restart(Math.max(0, seconds));

    let steps = 0;
    while (this.#sample && nextSampleAction(this.#sample, seconds) === 'advance' && steps < 300) {
      steps += 1;
      const next = this.#iter ? await this.#iter.next() : { done: true as const, value: undefined };
      if (next.done || !next.value) return this.#sample;
      if (next.value.timestamp > seconds + 1e-3) {
        next.value.close();
        return this.#sample;
      }
      this.#sample.close();
      this.#sample = next.value;
    }
    return this.#sample;
  }

  async #restart(seconds: number): Promise<void> {
    this.#sample?.close();
    this.#sample = null;
    await this.#iter?.return?.();
    this.#sample = await this.#sink.getSample(seconds);
    const duration = this.#sample && this.#sample.duration > 0 ? this.#sample.duration : 1 / 60;
    const after = this.#sample ? this.#sample.timestamp + duration : seconds;
    this.#iter = this.#sink.samples(after)[Symbol.asyncIterator]();
    if (!this.#sample) {
      const next = await this.#iter.next();
      if (!next.done && next.value) this.#sample = next.value;
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#sample?.close();
    this.#sample = null;
    void this.#iter?.return?.();
    this.#iter = null;
    this.#release();
  }
}

/** Opens a file for ordered frame reads. Returns null when the file cannot be decoded this way. */
export async function openSequentialVideo(blob: Blob): Promise<SequentialFrameSource | null> {
  const { Input, ALL_FORMATS, BlobSource, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      input.dispose();
      return null;
    }
    return new SequentialFrameSource(new VideoSampleSink(track), () => input.dispose());
  } catch {
    input.dispose();
    return null;
  }
}
