/** Whether the current browser can encode WebM via WebCodecs + VideoFrame. */
export function isWebCodecsExportSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioData !== 'undefined'
  );
}

export async function isVp9ExportSupported(): Promise<boolean> {
  if (!isWebCodecsExportSupported()) return false;
  try {
    const result = await VideoEncoder.isConfigSupported({
      codec: 'vp09.00.10.08',
      width: 640,
      height: 360,
      bitrate: 2_000_000,
      framerate: 30,
    });
    return result.supported === true;
  } catch {
    return false;
  }
}
