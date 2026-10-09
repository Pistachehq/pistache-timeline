import { clamp } from '@timeline/shared';
import { type MediaHandle, type MediaPlayer } from '../types';

/** {@link MediaPlayer} backed by a native `<video>` element owned by the UI. */
export class MediaElementPlayer implements MediaPlayer {
  readonly element: HTMLMediaElement;
  #source: string | null = null;

  constructor(element: HTMLMediaElement) {
    this.element = element;
    element.preload = 'auto';
    if (element instanceof HTMLVideoElement) element.playsInline = true;
  }

  get source(): string | null {
    return this.#source;
  }

  get currentTime(): number {
    return this.element.currentTime;
  }

  get paused(): boolean {
    return this.element.paused;
  }

  get ready(): boolean {
    return this.#source !== null && this.element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  load(handle: MediaHandle | null): void {
    const url = handle?.url ?? null;
    if (url === this.#source) return;
    this.#source = url;
    if (url === null) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element.load();
      return;
    }
    if (!url.startsWith('blob:')) this.element.crossOrigin = 'anonymous';
    else this.element.removeAttribute('crossorigin');
    this.element.src = url;
  }

  seek(seconds: number): void {
    if (this.#source === null) return;
    const duration = this.element.duration;
    const max = Number.isFinite(duration) ? duration : seconds;
    const target = clamp(seconds, 0, max);
    if (Math.abs(this.element.currentTime - target) > 0.001) this.element.currentTime = target;
  }

  async play(): Promise<void> {
    if (this.#source === null) return;
    await this.element.play();
  }

  pause(): void {
    this.element.pause();
  }

  setVolume(volume: number): void {
    this.element.volume = clamp(volume, 0, 1);
  }

  setMuted(muted: boolean): void {
    this.element.muted = muted;
  }

  dispose(): void {
    this.load(null);
  }
}
