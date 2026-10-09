import { TimelineError, throwIfAborted } from '@timeline/shared';
import { type MediaHandle } from '../../types';

export async function decodeAudioFromHandle(handle: MediaHandle, signal?: AbortSignal): Promise<AudioBuffer> {
  throwIfAborted(signal);
  const response = await fetch(handle.url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new TimelineError('IO', `Could not read audio from ${handle.url}.`);
  }
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(bytes.slice(0));
  } catch {
    throw new TimelineError('UNSUPPORTED_MEDIA', 'This file does not contain decodable audio.');
  } finally {
    await context.close();
  }
}
