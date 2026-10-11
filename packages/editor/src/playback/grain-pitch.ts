import { pitchRatioFromAmount, pitchWetMix } from '@timeline/core';

/** One grain of the delay sweep. Longer grains sound smoother and less metallic. */
const GRAIN_SECONDS = 0.1;

function makeBuffer(context: BaseAudioContext, fill: (t: number) => number): AudioBuffer {
  const length = Math.max(2, Math.round(GRAIN_SECONDS * context.sampleRate));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = fill(i / length);
  return buffer;
}

function loopingSource(context: BaseAudioContext, buffer: AudioBuffer, when: number): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start(when);
  return source;
}

/**
 * Pitch shift that keeps the clip's duration. Two delay grains are swept by
 * audio-rate ramps and crossfaded with a Hann window, so the tone moves
 * without the crackle of updating the delay from JavaScript every frame.
 * 100 is one octave up, −100 is one octave down.
 */
export class GrainPitchShift {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #context: BaseAudioContext;
  readonly #sources: AudioBufferSourceNode[] = [];
  readonly #upA: GainNode;
  readonly #upB: GainNode;
  readonly #downA: GainNode;
  readonly #downB: GainNode;
  readonly #dry: GainNode;
  readonly #wet: GainNode;
  #amount = Number.NaN;

  constructor(context: BaseAudioContext) {
    this.#context = context;
    this.input = context.createGain();
    this.output = context.createGain();

    const rising = makeBuffer(context, (t) => t);
    const falling = makeBuffer(context, (t) => 1 - t);
    const hann = makeBuffer(context, (t) => 0.5 * (1 - Math.cos(2 * Math.PI * t)));

    const delayA = context.createDelay(1);
    const delayB = context.createDelay(1);
    delayA.delayTime.value = 0;
    delayB.delayTime.value = 0;
    const mixA = context.createGain();
    const mixB = context.createGain();
    mixA.gain.value = 0;
    mixB.gain.value = 0;

    this.#upA = context.createGain();
    this.#upB = context.createGain();
    this.#downA = context.createGain();
    this.#downB = context.createGain();
    this.#upA.gain.value = 0;
    this.#upB.gain.value = 0;
    this.#downA.gain.value = 0;
    this.#downB.gain.value = 0;
    this.#dry = context.createGain();
    this.#wet = context.createGain();
    this.#dry.gain.value = 1;
    this.#wet.gain.value = 0;

    const now = context.currentTime + 0.05;
    const later = now + GRAIN_SECONDS / 2;
    const upA = loopingSource(context, falling, now);
    const downA = loopingSource(context, rising, now);
    const fadeA = loopingSource(context, hann, now);
    const upB = loopingSource(context, falling, later);
    const downB = loopingSource(context, rising, later);
    const fadeB = loopingSource(context, hann, later);
    this.#sources.push(upA, downA, fadeA, upB, downB, fadeB);

    upA.connect(this.#upA);
    downA.connect(this.#downA);
    upB.connect(this.#upB);
    downB.connect(this.#downB);
    this.#upA.connect(delayA.delayTime);
    this.#downA.connect(delayA.delayTime);
    this.#upB.connect(delayB.delayTime);
    this.#downB.connect(delayB.delayTime);
    fadeA.connect(mixA.gain);
    fadeB.connect(mixB.gain);

    this.input.connect(this.#dry);
    this.#dry.connect(this.output);
    this.input.connect(delayA);
    this.input.connect(delayB);
    delayA.connect(mixA);
    delayB.connect(mixB);
    mixA.connect(this.#wet);
    mixB.connect(this.#wet);
    this.#wet.connect(this.output);
  }

  setAmount(amount: number): void {
    const clamped = Math.max(-100, Math.min(100, amount));
    if (clamped === this.#amount) return;
    this.#amount = clamped;
    const ratio = pitchRatioFromAmount(clamped);
    const depth = Math.abs(ratio - 1) * GRAIN_SECONDS;
    const up = ratio > 1 ? depth : 0;
    const down = ratio < 1 ? depth : 0;
    const now = this.#context.currentTime;
    const tau = 0.02;
    const wet = pitchWetMix(clamped);
    this.#dry.gain.setTargetAtTime(Math.cos(wet * Math.PI * 0.5), now, tau);
    this.#wet.gain.setTargetAtTime(Math.sin(wet * Math.PI * 0.5), now, tau);
    this.#upA.gain.setTargetAtTime(up, now, tau);
    this.#upB.gain.setTargetAtTime(up, now, tau);
    this.#downA.gain.setTargetAtTime(down, now, tau);
    this.#downB.gain.setTargetAtTime(down, now, tau);
  }

  dispose(): void {
    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {
        // The source is already stopped.
      }
      source.disconnect();
    }
    this.input.disconnect();
    this.output.disconnect();
  }
}
