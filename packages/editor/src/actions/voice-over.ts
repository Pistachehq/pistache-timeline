import { findTrack, type MediaAsset, type MediaAssetId, type TrackId } from '@timeline/core';
import { currentSequence, type EditorServices } from '../runtime/services';

interface VoiceOverHooks {
  readonly importRecording: (file: File) => Promise<MediaAsset | null>;
  readonly placeRecording: (assetId: MediaAssetId, trackId: TrackId, start: number) => boolean;
}

interface Session {
  readonly trackId: TrackId;
  readonly trackName: string;
  readonly startFrame: number;
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly chunks: Blob[];
}

function preferredAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function recordingFile(blob: Blob): File {
  const raw = blob.type.split(';')[0] ?? '';
  const type = raw.startsWith('audio/') ? raw : 'audio/webm';
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const name = `Voice Over ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${ext}`;
  return new File([blob], name, { type });
}

function stopRecorder(recorder: MediaRecorder, chunks: Blob[]): Promise<Blob> {
  const type = recorder.mimeType || 'audio/webm';
  if (recorder.state === 'inactive') return Promise.resolve(new Blob(chunks, { type }));
  return new Promise((resolve) => {
    recorder.addEventListener(
      'stop',
      () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || type }));
      },
      { once: true },
    );
    recorder.stop();
  });
}

/** Records the microphone onto one audio track, starting at the playhead. */
export function createVoiceOver(services: EditorServices, hooks: VoiceOverHooks) {
  const { ui, playback } = services.stores;
  let generation = 0;
  let pendingTrackId: TrackId | null = null;
  let session: Session | null = null;

  const clearArm = (trackId: TrackId) => {
    if (pendingTrackId === trackId) pendingTrackId = null;
    if (ui.getState().voiceOverTrackId === trackId && !session) ui.getState().setVoiceOverTrackId(null);
  };

  const finish = async (save: boolean) => {
    const current = session;
    session = null;
    pendingTrackId = null;
    ui.getState().setVoiceOverTrackId(null);
    if (!current) return;
    playback.getState().setPlaying(false);
    const blob = await stopRecorder(current.recorder, current.chunks);
    for (const track of current.stream.getTracks()) track.stop();
    if (!save) return;
    if (blob.size === 0) {
      ui.getState().notify('The recording was empty.', 'warning');
      return;
    }
    const asset = await hooks.importRecording(recordingFile(blob));
    if (!asset) return;
    const placed = hooks.placeRecording(asset.id, current.trackId, current.startFrame);
    if (placed) ui.getState().notify(`Voice over added to ${current.trackName}.`, 'success');
  };

  const begin = async (trackId: TrackId) => {
    const sequence = currentSequence(services);
    const track = sequence ? findTrack(sequence, trackId) : undefined;
    if (!track || track.kind !== 'audio') return;
    if (track.locked) {
      ui.getState().notify(`${track.name} is locked.`, 'warning');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      ui.getState().notify('This browser cannot record a microphone.', 'error');
      return;
    }

    const token = ++generation;
    pendingTrackId = trackId;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      clearArm(trackId);
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      ui.getState().notify(denied ? 'Microphone access was denied.' : 'Could not open the microphone.', 'error');
      return;
    }
    if (token !== generation) {
      for (const mediaTrack of stream.getTracks()) mediaTrack.stop();
      return;
    }

    const mime = preferredAudioMime();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      for (const mediaTrack of stream.getTracks()) mediaTrack.stop();
      clearArm(trackId);
      ui.getState().notify('Could not start the microphone.', 'error');
      return;
    }

    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const next: Session = {
      trackId,
      trackName: track.name,
      startFrame: Math.max(0, playback.getState().playhead),
      recorder,
      stream,
      chunks,
    };
    session = next;
    pendingTrackId = null;
    ui.getState().setVoiceOverTrackId(trackId);
    try {
      recorder.start();
    } catch {
      session = null;
      for (const mediaTrack of stream.getTracks()) mediaTrack.stop();
      ui.getState().setVoiceOverTrackId(null);
      ui.getState().notify('Could not start the microphone.', 'error');
      return;
    }
    playback.getState().setPlaying(true);
    ui.getState().notify(`Recording voice over on ${track.name}. Click the microphone again to stop.`, 'info');
  };

  return {
    /** Starts a take on this audio track, or stops the one already running there. */
    async toggle(trackId: TrackId): Promise<void> {
      if (session?.trackId === trackId || pendingTrackId === trackId) {
        generation += 1;
        await finish(session !== null);
        return;
      }
      if (session || pendingTrackId) {
        generation += 1;
        await finish(session !== null);
      }
      await begin(trackId);
    },

    /** Drops an in-progress take without placing it. */
    cancel(): void {
      generation += 1;
      const current = session;
      session = null;
      pendingTrackId = null;
      ui.getState().setVoiceOverTrackId(null);
      if (!current) return;
      playback.getState().setPlaying(false);
      if (current.recorder.state !== 'inactive') current.recorder.stop();
      for (const track of current.stream.getTracks()) track.stop();
    },
  };
}
