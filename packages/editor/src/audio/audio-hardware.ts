/** Saved audio device choice. An empty id follows the system default. */
export interface AudioHardwarePrefs {
  readonly inputDeviceId: string;
  readonly outputDeviceId: string;
}

export interface ListedAudioDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface AudioDeviceLists {
  readonly inputs: readonly ListedAudioDevice[];
  readonly outputs: readonly ListedAudioDevice[];
  readonly inputDefaultLabel: string;
  readonly outputDefaultLabel: string;
  /** True when the browser hid names until the microphone is allowed. */
  readonly namesHidden: boolean;
  readonly unavailable: boolean;
}

interface DeviceRecord {
  readonly deviceId: string;
  readonly kind: string;
  readonly label: string;
}

type SinkTarget = AudioContext | HTMLMediaElement;

const STORAGE_KEY = 'timeline.audio-hardware';
const EMPTY: AudioHardwarePrefs = { inputDeviceId: '', outputDeviceId: '' };
const SKIPPED_IDS = new Set(['default', 'communications']);

const targets = new Set<SinkTarget>();
const listeners = new Set<(prefs: AudioHardwarePrefs) => void>();
let prefs = readStored();

export function parseAudioHardware(raw: string | null): AudioHardwarePrefs {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return EMPTY;
    const record = value as { inputDeviceId?: unknown; outputDeviceId?: unknown };
    return {
      inputDeviceId: typeof record.inputDeviceId === 'string' ? record.inputDeviceId : '',
      outputDeviceId: typeof record.outputDeviceId === 'string' ? record.outputDeviceId : '',
    };
  } catch {
    return EMPTY;
  }
}

export function microphoneConstraints(inputDeviceId: string): MediaTrackConstraints {
  const shared = { echoCancellation: true, noiseSuppression: true };
  if (!inputDeviceId) return shared;
  return { ...shared, deviceId: { exact: inputDeviceId } };
}

export function listsFromDevices(devices: readonly DeviceRecord[]): AudioDeviceLists {
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const outputs = devices.filter((device) => device.kind === 'audiooutput');
  const named = devices.some(
    (device) =>
      (device.kind === 'audioinput' || device.kind === 'audiooutput') && device.label.trim() !== '',
  );
  return {
    inputs: concrete(inputs, 'audioinput'),
    outputs: concrete(outputs, 'audiooutput'),
    inputDefaultLabel: defaultLabel(inputs),
    outputDefaultLabel: defaultLabel(outputs),
    namesHidden: (inputs.length > 0 || outputs.length > 0) && !named,
    unavailable: false,
  };
}

export function canSelectOutputDevice(): boolean {
  const context = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  const media = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  return context || media;
}

export function getAudioHardware(): AudioHardwarePrefs {
  return prefs;
}

export function subscribeAudioHardware(listener: (prefs: AudioHardwarePrefs) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Routes later program and source playback to the saved output. */
export function bindOutputTarget(target: SinkTarget): () => void {
  targets.add(target);
  const id = prefs.outputDeviceId;
  if (id && hasSink(target)) void applyOutputDevice(target, id).catch(() => undefined);
  return () => {
    targets.delete(target);
  };
}

export function setInputDevice(inputDeviceId: string): void {
  remember({ ...prefs, inputDeviceId });
}

/** Saves the output and moves every live player onto it. Returns an error message on failure. */
export async function setOutputDevice(outputDeviceId: string): Promise<string | null> {
  if (outputDeviceId === prefs.outputDeviceId) return null;
  if (outputDeviceId && !canSelectOutputDevice()) return 'This browser cannot choose an audio output.';
  const previous = prefs.outputDeviceId;
  const capable = [...targets].filter(hasSink);
  for (const target of capable) {
    try {
      await applyOutputDevice(target, outputDeviceId);
    } catch (error) {
      for (const restore of capable) {
        try {
          await applyOutputDevice(restore, previous);
        } catch {
          // Keep whichever device still accepts audio.
        }
      }
      return error instanceof Error ? error.message : 'Could not switch the output device.';
    }
  }
  remember({ ...prefs, outputDeviceId });
  return null;
}

export async function loadAudioDeviceLists(): Promise<AudioDeviceLists> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return {
      inputs: [],
      outputs: [],
      inputDefaultLabel: 'System default',
      outputDefaultLabel: 'System default',
      namesHidden: false,
      unavailable: true,
    };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return listsFromDevices(devices);
}

/** Asks for the microphone once so the browser reveals device names. */
export async function revealAudioDeviceNames(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot list audio devices.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

async function applyOutputDevice(target: SinkTarget, deviceId: string): Promise<void> {
  const sink = target as SinkTarget & { setSinkId?: (sinkId: string) => Promise<void> };
  if (typeof sink.setSinkId !== 'function') {
    if (!deviceId) return;
    throw new Error('This browser cannot choose an audio output.');
  }
  try {
    await sink.setSinkId(deviceId);
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'NotAllowedError')) {
      throw new Error('That output device is not available.');
    }
    throw new Error('Could not switch the output device.');
  }
}

function hasSink(target: SinkTarget): boolean {
  return typeof (target as { setSinkId?: unknown }).setSinkId === 'function';
}

function concrete(devices: readonly DeviceRecord[], kind: 'audioinput' | 'audiooutput'): ListedAudioDevice[] {
  const fallback = kind === 'audioinput' ? 'Microphone' : 'Speaker';
  return devices
    .filter((device) => device.deviceId !== '' && !SKIPPED_IDS.has(device.deviceId))
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label.trim() || `${fallback} ${index + 1}`,
    }));
}

function defaultLabel(devices: readonly DeviceRecord[]): string {
  const system = devices.find((device) => device.deviceId === 'default' && device.label.trim() !== '');
  if (!system) return 'System default';
  const cleaned = system.label.replace(/^Default\s*[-–—]\s*/i, '').trim();
  return cleaned ? `System default (${cleaned})` : 'System default';
}

function remember(next: AudioHardwarePrefs): void {
  prefs = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode can block storage. The choice still applies this session.
  }
  for (const listener of listeners) listener(prefs);
}

function readStored(): AudioHardwarePrefs {
  try {
    if (typeof localStorage === 'undefined') return EMPTY;
    return parseAudioHardware(localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}
