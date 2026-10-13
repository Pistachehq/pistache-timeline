import { type AudioEffect } from '@timeline/core';

export interface AudioEffectChain {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** True when the chain does more than pass audio through. */
  readonly active: boolean;
  dispose(): void;
}

type NoiseGate = AudioEffect & { kind: 'noise-gate' };

const dbToGain = (db: number) => 10 ** (db / 20);

/** Effects that run as Web Audio nodes. Gain and pitch stay on the lane; the gate runs first, outside the chain. */
function chainEffects(effects: readonly AudioEffect[]): AudioEffect[] {
  return effects.filter((effect) => effect.kind !== 'gain' && effect.kind !== 'pitch' && effect.kind !== 'noise-gate');
}

/** Stable key for the node graph, so playback only rebuilds when a setting changes. */
export function audioChainKey(effects: readonly AudioEffect[]): string {
  return JSON.stringify(chainEffects(effects));
}

export function noiseGateOf(effects: readonly AudioEffect[]): NoiseGate | null {
  let gate: NoiseGate | null = null;
  for (const effect of effects) {
    if (effect.kind === 'noise-gate') gate = effect;
  }
  return gate;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const impulseCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Decaying stereo noise; the same seed in playback and export so both sound alike. */
function reverbImpulse(ctx: BaseAudioContext, size: number, damping: number): AudioBuffer {
  const key = `${size}|${damping}`;
  let cache = impulseCache.get(ctx);
  if (!cache) {
    cache = new Map();
    impulseCache.set(ctx, cache);
  }
  const hit = cache.get(key);
  if (hit) return hit;
  const seconds = 0.35 + (Math.min(100, Math.max(0, size)) / 100) * 3.4;
  const length = Math.max(1, Math.round(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const darkness = Math.min(100, Math.max(0, damping)) / 100;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const random = mulberry32(0x9e3779b9 + channel * 7919);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const coefficient = Math.min(0.97, 0.05 + darkness * 0.9 * t);
      low = low * coefficient + (random() * 2 - 1) * (1 - coefficient);
      data[i] = low * (1 - t) ** 2.4;
    }
  }
  cache.set(key, buffer);
  return buffer;
}

/** Builds EQ, dynamics, delay and reverb in the order the effects are stacked on the clip. */
export function buildAudioEffectChain(ctx: BaseAudioContext, effects: readonly AudioEffect[]): AudioEffectChain {
  const input = ctx.createGain();
  const nodes: AudioNode[] = [input];
  let tail: AudioNode = input;
  const link = (node: AudioNode) => {
    tail.connect(node);
    tail = node;
    nodes.push(node);
  };
  const list = chainEffects(effects);

  for (const effect of list) {
    switch (effect.kind) {
      case 'highpass':
      case 'lowpass': {
        const filter = ctx.createBiquadFilter();
        filter.type = effect.kind;
        filter.frequency.value = Math.min(ctx.sampleRate / 2 - 1, Math.max(10, effect.frequencyHz));
        filter.Q.value = effect.q;
        link(filter);
        break;
      }
      case 'eq': {
        const low = ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = effect.lowFrequencyHz;
        low.gain.value = effect.lowGainDb;
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = effect.midFrequencyHz;
        mid.Q.value = effect.midQ;
        mid.gain.value = effect.midGainDb;
        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = Math.min(ctx.sampleRate / 2 - 1, effect.highFrequencyHz);
        high.gain.value = effect.highGainDb;
        link(low);
        link(mid);
        link(high);
        break;
      }
      case 'compressor': {
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = Math.min(0, Math.max(-100, effect.thresholdDb));
        compressor.knee.value = Math.min(40, Math.max(0, effect.kneeDb));
        compressor.ratio.value = Math.min(20, Math.max(1, effect.ratio));
        compressor.attack.value = Math.min(1, Math.max(0, effect.attackMs) / 1000);
        compressor.release.value = Math.min(1, Math.max(0, effect.releaseMs) / 1000);
        link(compressor);
        if (effect.makeupDb !== 0) {
          const makeup = ctx.createGain();
          makeup.gain.value = dbToGain(effect.makeupDb);
          link(makeup);
        }
        break;
      }
      case 'limiter': {
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = Math.min(0, Math.max(-60, effect.ceilingDb));
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = Math.min(1, Math.max(0.001, effect.releaseMs / 1000));
        link(limiter);
        break;
      }
      case 'delay': {
        const mix = Math.min(1, Math.max(0, effect.mix / 100));
        const out = ctx.createGain();
        const dry = ctx.createGain();
        dry.gain.value = 1 - mix * 0.5;
        const delay = ctx.createDelay(2.5);
        delay.delayTime.value = Math.min(2.5, Math.max(0.001, effect.timeMs / 1000));
        const feedback = ctx.createGain();
        feedback.gain.value = Math.min(0.9, Math.max(0, effect.feedback / 100));
        const damp = ctx.createBiquadFilter();
        damp.type = 'lowpass';
        damp.frequency.value = 6000;
        const wet = ctx.createGain();
        wet.gain.value = mix;
        tail.connect(dry);
        tail.connect(delay);
        delay.connect(damp);
        damp.connect(feedback);
        feedback.connect(delay);
        damp.connect(wet);
        dry.connect(out);
        wet.connect(out);
        nodes.push(out, dry, delay, feedback, damp, wet);
        tail = out;
        break;
      }
      case 'reverb': {
        const mix = Math.min(1, Math.max(0, effect.mix / 100));
        const out = ctx.createGain();
        const dry = ctx.createGain();
        dry.gain.value = 1 - mix * 0.5;
        const convolver = ctx.createConvolver();
        convolver.buffer = reverbImpulse(ctx, effect.size, effect.damping);
        const wet = ctx.createGain();
        wet.gain.value = mix;
        tail.connect(dry);
        tail.connect(convolver);
        convolver.connect(wet);
        dry.connect(out);
        wet.connect(out);
        nodes.push(out, dry, convolver, wet);
        tail = out;
        break;
      }
      default:
        break;
    }
  }

  return {
    input,
    output: tail,
    active: list.length > 0,
    dispose: () => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    },
  };
}

/** Gain reduction for the gate given the current peak level. */
export function gateTargetGain(gate: NoiseGate, peak: number): number {
  return peak >= dbToGain(gate.thresholdDb) ? 1 : dbToGain(Math.min(0, gate.rangeDb));
}

/** Offline noise gate with attack and release smoothing. Mutates the buffers. */
export function applyNoiseGate(left: Float32Array, right: Float32Array, sampleRate: number, gate: NoiseGate): void {
  const threshold = dbToGain(gate.thresholdDb);
  const floor = dbToGain(Math.min(0, gate.rangeDb));
  const coefficient = (ms: number) => 1 - Math.exp(-1 / Math.max(1, (ms / 1000) * sampleRate));
  const attack = coefficient(Math.max(0.1, gate.attackMs));
  const release = coefficient(Math.max(1, gate.releaseMs));
  const envelopeRelease = coefficient(30);
  let envelope = 0;
  let gain = 1;
  for (let i = 0; i < left.length; i++) {
    const level = Math.max(Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
    envelope = level > envelope ? level : envelope + (level - envelope) * envelopeRelease;
    const target = envelope >= threshold ? 1 : floor;
    gain += (target - gain) * (target > gain ? attack : release);
    left[i] = (left[i] ?? 0) * gain;
    right[i] = (right[i] ?? 0) * gain;
  }
}

/** Runs one clip's audio through its effects. Returns new buffers; the inputs are left untouched. */
export async function renderAudioEffects(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  effects: readonly AudioEffect[],
): Promise<{ left: Float32Array; right: Float32Array }> {
  const outLeft = new Float32Array(left);
  const outRight = new Float32Array(right);
  const gate = noiseGateOf(effects);
  if (gate) applyNoiseGate(outLeft, outRight, sampleRate, gate);
  if (chainEffects(effects).length === 0 || outLeft.length === 0) return { left: outLeft, right: outRight };
  if (typeof OfflineAudioContext === 'undefined') return { left: outLeft, right: outRight };

  const ctx = new OfflineAudioContext(2, outLeft.length, sampleRate);
  const buffer = ctx.createBuffer(2, outLeft.length, sampleRate);
  buffer.copyToChannel(outLeft, 0);
  buffer.copyToChannel(outRight, 1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const chain = buildAudioEffectChain(ctx, effects);
  source.connect(chain.input);
  chain.output.connect(ctx.destination);
  source.start(0);
  const rendered = await ctx.startRendering();
  return { left: rendered.getChannelData(0).slice(), right: rendered.getChannelData(1).slice() };
}
