/** Web Audio routing for program audio: gain, pan, peak meter. */

let boundElement: HTMLMediaElement | null = null;
let context: AudioContext | null = null;
let gainNode: GainNode | null = null;
let pannerNode: StereoPannerNode | null = null;
let analyser: AnalyserNode | null = null;
let timeDomain: Uint8Array | null = null;

function ensureGraph(element: HTMLMediaElement): AnalyserNode | null {
  if (boundElement === element && analyser && gainNode && pannerNode) return analyser;
  teardown();
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(node);
    node.connect(ctx.destination);
    void ctx.resume();
    context = ctx;
    gainNode = gain;
    pannerNode = panner;
    analyser = node;
    boundElement = element;
    timeDomain = new Uint8Array(node.fftSize);
    element.volume = 1;
    return node;
  } catch {
    teardown();
    return null;
  }
}

export function teardownPlaybackAudioMeter(): void {
  teardown();
}

function teardown(): void {
  void context?.close();
  context = null;
  gainNode = null;
  pannerNode = null;
  analyser = null;
  boundElement = null;
  timeDomain = null;
}

/** Applies linear gain and stereo pan (−100…100). Mute with gain 0. */
export function setPlaybackAudioMix(
  element: HTMLMediaElement | null,
  linearGain: number,
  pan: number,
): void {
  if (!element) return;
  const clampedGain = Math.max(0, linearGain);
  const clampedPan = Math.max(-100, Math.min(100, pan));
  ensureGraph(element);
  if (gainNode && pannerNode) {
    gainNode.gain.value = clampedGain;
    pannerNode.pan.value = clampedPan / 100;
    return;
  }
  element.volume = Math.min(1, clampedGain);
}

/** @deprecated Use {@link setPlaybackAudioMix}. */
export function setPlaybackAudioGain(element: HTMLMediaElement | null, linearGain: number): void {
  setPlaybackAudioMix(element, linearGain, 0);
}

export function readPlaybackAudioPeak(element: HTMLMediaElement | null): number {
  if (!element || element.paused) return 0;
  const node = ensureGraph(element);
  if (!node || !timeDomain) return 0;
  node.getByteTimeDomainData(timeDomain as Uint8Array<ArrayBuffer>);
  let peak = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    peak = Math.max(peak, Math.abs(timeDomain[i]! - 128) / 128);
  }
  return peak;
}
