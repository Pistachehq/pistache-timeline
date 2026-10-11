import {
  addMediaAssets,
  type ClipId,
  createMediaAsset,
  getActiveSequence,
  getAssetFrameCount,
  guessSpeechLanguage,
  mediaTimeFromSeconds,
  replaceSpokenAudio,
  textClipName,
  type MediaAsset,
} from '@timeline/core';
import { type MediaEngine, type MediaHandle } from '@timeline/media';
import { toErrorMessage } from '@timeline/shared';
import { type EditorServices } from '../runtime/services';
import { type MediaActions } from './media-actions';
import { speakText } from './speak-text';
import { encodeWav, silentSamples } from './wav-audio';

const SAMPLE_RATE = 16_000;
const EDIT_DELAY_MS = 420;

export interface SpokenFile {
  readonly asset: MediaAsset;
  readonly handle: MediaHandle;
}

export async function loadSpeechWav(
  engine: MediaEngine,
  samples: Float32Array,
  sampleRate: number,
  fileName: string,
  name: string,
): Promise<SpokenFile | string> {
  const file = new File([encodeWav(samples, sampleRate)], fileName, { type: 'audio/wav', lastModified: Date.now() });
  let picked;
  try {
    picked = await engine.importLocalFiles([file]);
  } catch (error) {
    return toErrorMessage(error);
  }
  const item = picked.files[0];
  if (!item) return picked.rejected[0]?.reason ?? 'Could not read the spoken audio.';
  try {
    const metadata = await engine.probe(item.handle, 'audio');
    if (!(metadata.durationSeconds > 0) || !metadata.hasAudio) {
      engine.release(item.handle);
      return 'The spoken audio was empty.';
    }
    const asset = createMediaAsset({
      name,
      kind: 'audio',
      source: item.source,
      duration: mediaTimeFromSeconds(metadata.durationSeconds),
      hasVideo: false,
      hasAudio: true,
      metadata: {
        audioCodec: metadata.audioCodec,
        probedBy: metadata.probedBy,
      },
    });
    return { asset, handle: item.handle };
  } catch (error) {
    engine.release(item.handle);
    return toErrorMessage(error);
  }
}

/**
 * Keeps each spoken text clip's linked audio in step with its words.
 * The take is applied without its own undo step, so undoing the text edit
 * restores the voice that belonged to the previous words.
 */
export function createSpeechSync(services: EditorServices, media: MediaActions): void {
  const { project: projectStore, ui } = services.stores;
  const engine = services.platform.media;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const jobs = new Map<string, { readonly content: string; readonly controller: AbortController }>();
  const failed = new Map<string, string>();
  let applying = false;

  const clipNow = (clipId: ClipId) => {
    const sequence = getActiveSequence(projectStore.getState().project);
    return { sequence, clip: sequence?.clips[clipId] };
  };

  const schedule = () => {
    if (applying) return;
    const sequence = getActiveSequence(projectStore.getState().project);
    const pending = new Set<string>();
    if (sequence) {
      for (const clip of Object.values(sequence.clips)) {
        if (!clip.speaks || !clip.text) continue;
        const content = clip.text.content;
        if (clip.spokenText === content || failed.get(clip.id) === content) continue;
        pending.add(clip.id);
        const job = jobs.get(clip.id);
        if (job?.content === content) continue;
        if (job) job.controller.abort();
        const existing = timers.get(clip.id);
        if (existing) clearTimeout(existing);
        const delay = clip.spokenText === null ? 160 : EDIT_DELAY_MS;
        timers.set(
          clip.id,
          setTimeout(() => {
            timers.delete(clip.id);
            void speakClip(clip.id);
          }, delay),
        );
      }
    }
    for (const [id, timer] of timers) {
      if (pending.has(id)) continue;
      clearTimeout(timer);
      timers.delete(id);
      jobs.get(id)?.controller.abort();
    }
  };

  const speakClip = async (clipId: ClipId) => {
    const first = clipNow(clipId);
    const clip = first.clip;
    const sequence = first.sequence;
    if (!sequence || !clip?.speaks || !clip.text) return;
    const content = clip.text.content;
    if (clip.spokenText === content || jobs.get(clipId)?.content === content) return;
    const controller = new AbortController();
    jobs.set(clipId, { content, controller });
    const previousAssetId = clip.linkId ? sequence.clips[clip.linkId]?.assetId ?? null : null;
    const task = ui.getState().startTask(content.trim() ? 'Speaking…' : 'Clearing voice…');
    try {
      const spoken = content.trim()
        ? await speakText(content, guessSpeechLanguage(content), controller.signal, (message) => {
            ui.getState().updateTask(task, message);
          })
        : { samples: silentSamples(0.35, SAMPLE_RATE), sampleRate: SAMPLE_RATE };
      if (controller.signal.aborted || jobs.get(clipId)?.controller !== controller) return;
      const latest = clipNow(clipId);
      const live = latest.sequence;
      if (!live || latest.clip?.text?.content !== content) return;
      const loaded = await loadSpeechWav(
        engine,
        spoken.samples,
        spoken.sampleRate,
        `Speech-${clipId}-${Date.now()}.wav`,
        textClipName(content),
      );
      if (controller.signal.aborted || jobs.get(clipId)?.controller !== controller) {
        if (typeof loaded !== 'string') engine.release(loaded.handle);
        return;
      }
      if (typeof loaded === 'string') {
        failed.set(clipId, content);
        ui.getState().notify(loaded, 'error');
        return;
      }
      const frames = Math.max(1, getAssetFrameCount(loaded.asset, live));
      applying = true;
      const result = projectStore.getState().replacePresent((project) => {
        const added = addMediaAssets(project, [loaded.asset]);
        if (!added.ok) return added;
        return replaceSpokenAudio(added.value, {
          sequenceId: live.id,
          clipId,
          spokenText: content,
          assetId: loaded.asset.id,
          durationFrames: frames,
          ...(previousAssetId ? { retireAssetId: previousAssetId } : {}),
        });
      });
      applying = false;
      if (!result.ok) {
        engine.release(loaded.handle);
        if (result.error.code !== 'CONFLICT') {
          failed.set(clipId, content);
          ui.getState().notify(result.error.message, result.error.code === 'LOCKED' ? 'warning' : 'error');
        }
        return;
      }
      failed.delete(clipId);
      media.adoptGeneratedAudio(loaded.asset, loaded.handle);
    } catch (error) {
      applying = false;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      failed.set(clipId, content);
      ui.getState().notify(error instanceof Error ? error.message : 'Could not speak this text.', 'error');
    } finally {
      if (jobs.get(clipId)?.controller === controller) jobs.delete(clipId);
      ui.getState().endTask(task);
      schedule();
    }
  };

  projectStore.subscribe(schedule);
}
