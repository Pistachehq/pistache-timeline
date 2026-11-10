import {
  AutoProcessor,
  AutoTokenizer,
  CLIPSegForImageSegmentation,
  env,
  RawImage,
  SamModel,
  type PreTrainedTokenizer,
  type Processor,
  type Tensor,
} from '@huggingface/transformers';
import {
  composeKeepRemove,
  emptyMask,
  lumaOfRgb,
  maskBoxes,
  maskSamplePoints,
  maxMasks,
  splitPromptPhrases,
  thresholdMask,
  warpMaskWithFlow,
  type AlphaMask,
} from '@timeline/core';
import ortMjs from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import ortWasm from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import { type SegmentEvent, type SegmentJob } from './messages';

const CLIPSEG_ID = 'Xenova/clipseg-rd64-refined';
const SAM_ID = 'Xenova/slimsam-77-uniform';
const DETECT_LABELS = ['person', 'human', 'animal', 'dog', 'cat', 'vehicle', 'car', 'truck', 'robot', 'rover'] as const;

interface WorkerScope {
  postMessage(message: SegmentEvent, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SegmentJob>) => void): void;
}

const scope = self as unknown as WorkerScope;
let reportProgress: (message: string) => void = () => {};

function configureRuntime(): void {
  env.allowLocalModels = false;
  const wasm = env.backends.onnx.wasm;
  if (!wasm) return;
  wasm.numThreads = 1;
  wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
}

interface ClipSegBundle {
  readonly tokenizer: PreTrainedTokenizer;
  readonly processor: Processor;
  readonly model: CLIPSegForImageSegmentation;
}

interface SamProcessor extends Processor {
  post_process_masks(masks: Tensor, originalSizes: unknown, reshapedSizes: unknown): Promise<unknown> | unknown;
}

interface SamBundle {
  readonly processor: SamProcessor;
  readonly model: SamModel;
}

let clipseg: Promise<ClipSegBundle> | null = null;
let sam: Promise<SamBundle> | null = null;

function loadClipSeg(): Promise<ClipSegBundle> {
  if (!clipseg) {
    configureRuntime();
    clipseg = Promise.all([
      AutoTokenizer.from_pretrained(CLIPSEG_ID),
      AutoProcessor.from_pretrained(CLIPSEG_ID),
      CLIPSegForImageSegmentation.from_pretrained(CLIPSEG_ID, {
        device: 'wasm',
        dtype: 'fp32',
        progress_callback: (info: { status?: string }) => {
          if (info.status === 'progress' || info.status === 'download') reportProgress('Downloading CLIPSeg…');
        },
      }),
    ]).then(([tokenizer, processor, model]) => ({ tokenizer, processor, model }));
    clipseg.catch(() => {
      clipseg = null;
    });
  }
  return clipseg;
}

function loadSam(): Promise<SamBundle> {
  if (!sam) {
    configureRuntime();
    sam = Promise.all([
      AutoProcessor.from_pretrained(SAM_ID),
      SamModel.from_pretrained(SAM_ID, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (info: { status?: string }) => {
          if (info.status === 'progress' || info.status === 'download') reportProgress('Downloading SAM…');
        },
      }),
    ]).then(([processor, model]) => ({ processor: processor as SamProcessor, model: model as SamModel }));
    sam.catch(() => {
      sam = null;
    });
  }
  return sam;
}

function bitmapToRaw(bitmap: ImageBitmap): RawImage {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read this frame.');
  ctx.drawImage(bitmap, 0, 0);
  return RawImage.fromCanvas(canvas);
}

function lumaFromRaw(image: RawImage): Uint8Array {
  const rgb = image.rgb();
  return lumaOfRgb(rgb.data, rgb.width, rgb.height);
}

function tensorToConfidence(tensor: Tensor, index: number): AlphaMask {
  const dims = tensor.dims;
  const height = dims[dims.length - 2] ?? 1;
  const width = dims[dims.length - 1] ?? 1;
  const plane = width * height;
  const offset = index * plane;
  const src = tensor.data as Float32Array | Uint8Array;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < plane; i++) {
    const raw = Number(src[offset + i] ?? 0);
    if (raw < min) min = raw;
    if (raw > max) max = raw;
  }
  const data = new Uint8Array(plane);
  const asUnit = max <= 1.01 && min >= -0.02;
  for (let i = 0; i < plane; i++) {
    const raw = Number(src[offset + i] ?? 0);
    const unit = asUnit ? Math.min(1, Math.max(0, raw)) : 1 / (1 + Math.exp(-raw));
    data[i] = Math.max(0, Math.min(255, Math.round(unit * 255)));
  }
  return { data, width, height };
}

async function clipsegMasks(image: RawImage, phrases: readonly string[]): Promise<AlphaMask | null> {
  if (phrases.length === 0) return null;
  reportProgress('Running CLIPSeg…');
  const bundle = await loadClipSeg();
  const text = bundle.tokenizer(phrases as string[], { padding: true, truncation: true });
  const pixels = await bundle.processor(image);
  const output = (await bundle.model({ ...text, ...pixels })) as { logits: Tensor };
  let combined: AlphaMask | null = null;
  const count = output.logits.dims[0] ?? 1;
  for (let i = 0; i < count; i++) {
    const plane = tensorToConfidence(output.logits, i);
    combined = combined ? maxMasks(combined, plane) : plane;
  }
  return combined;
}

function bestSamPlane(masks: Tensor, scores: Tensor | undefined): AlphaMask {
  const n = masks.dims[1] ?? 1;
  let best = 0;
  let bestScore = -Infinity;
  const scoreData = scores?.data as Float32Array | undefined;
  if (scoreData) {
    for (let i = 0; i < Math.min(n, scoreData.length); i++) {
      const score = scoreData[i] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  const squeezed = masks.dims.length === 4 ? masks : masks;
  return thresholdMask(tensorToConfidence(squeezed, best), 128);
}

async function samMask(
  image: RawImage,
  points: readonly { x: number; y: number; include: boolean }[],
  boxes: readonly { x: number; y: number; w: number; h: number; include: boolean }[],
): Promise<{ keep: AlphaMask | null; remove: AlphaMask | null }> {
  const includePoints = points.filter((p) => p.include);
  const excludePoints = points.filter((p) => !p.include);
  const includeBoxes = boxes.filter((b) => b.include);
  const excludeBoxes = boxes.filter((b) => !b.include);
  if (includePoints.length === 0 && includeBoxes.length === 0 && excludePoints.length === 0 && excludeBoxes.length === 0) {
    return { keep: null, remove: null };
  }
  reportProgress('Running SAM…');
  const bundle = await loadSam();
  const run = async (
    pts: readonly { x: number; y: number; include: boolean }[],
    box: { x: number; y: number; w: number; h: number } | null,
  ) => {
    const input_points = pts.length > 0 ? [[pts.map((p) => [p.x, p.y])]] : undefined;
    const input_labels = pts.length > 0 ? [[pts.map((p) => (p.include ? 1 : 0))]] : undefined;
    const input_boxes = box ? [[[[box.x, box.y, box.x + box.w, box.y + box.h]]]] : undefined;
    const inputs = await bundle.processor(image, {
      ...(input_points ? { input_points } : {}),
      ...(input_labels ? { input_labels } : {}),
      ...(input_boxes ? { input_boxes } : {}),
    });
    const outputs = (await bundle.model(inputs)) as { pred_masks: Tensor; iou_scores: Tensor };
    const processed = await bundle.processor.post_process_masks(
      outputs.pred_masks,
      inputs.original_sizes,
      inputs.reshaped_input_sizes,
    );
    const plane = Array.isArray(processed) ? processed[0] : processed;
    if (!plane) return emptyMask(image.width, image.height);
    return bestSamPlane(plane as Tensor, outputs.iou_scores);
  };

  let keep: AlphaMask | null = null;
  if (includePoints.length > 0) keep = await run([...includePoints, ...excludePoints], null);
  for (const box of includeBoxes) {
    const plane = await run(excludePoints, box);
    keep = keep ? maxMasks(keep, plane) : plane;
  }
  let remove: AlphaMask | null = null;
  for (const box of excludeBoxes) {
    const plane = await run([], box);
    remove = remove ? maxMasks(remove, plane) : plane;
  }
  if (excludePoints.length > 0 && includePoints.length === 0 && includeBoxes.length === 0) {
    remove = await run(excludePoints.map((p) => ({ ...p, include: true })), null);
  }
  return { keep, remove };
}

function pointsFromMask(
  mask: AlphaMask | null,
  include: boolean,
  imageWidth: number,
  imageHeight: number,
  count: number,
): { x: number; y: number; include: boolean }[] {
  if (!mask) return [];
  const binary = thresholdMask(mask, 128);
  return maskSamplePoints(binary, count).map((point) => ({
    x: point.u * (imageWidth - 1),
    y: point.v * (imageHeight - 1),
    include,
  }));
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|offline|failed to load|httperror|status code/i.test(message)) {
    return 'Could not download the segmentation models. Check your connection and try again.';
  }
  if (/webgpu|gpu/i.test(message)) {
    return 'This segmentation model runs on WebAssembly, not WebGPU. Try again.';
  }
  if (/memory|oom|out of memory/i.test(message)) {
    return 'Not enough memory for this model. Use Preview quality or a smaller frame.';
  }
  return message.trim() ? message : 'Could not segment this frame.';
}

async function handle(job: SegmentJob): Promise<void> {
  if (job.type === 'propagate') {
    const prev = bitmapToRaw(job.prev);
    const next = bitmapToRaw(job.next);
    const warped = thresholdMask(
      warpMaskWithFlow(
        { data: job.mask, width: job.maskWidth, height: job.maskHeight },
        lumaFromRaw(prev),
        lumaFromRaw(next),
        next.width,
        next.height,
      ),
      128,
    );
    job.prev.close();
    job.next.close();
    scope.postMessage({ id: job.id, type: 'mask', data: warped.data, width: warped.width, height: warped.height }, [
      warped.data.buffer,
    ]);
    return;
  }

  const image = bitmapToRaw(job.bitmap);
  job.bitmap.close();

  if (job.type === 'detect') {
    reportProgress('Detecting subjects…');
    const mask = await clipsegMasks(image, [...DETECT_LABELS]);
    const boxes = mask ? maskBoxes(thresholdMask(mask, 128), 0.01) : [];
    scope.postMessage({
      id: job.id,
      type: 'detect',
      boxes: boxes.slice(0, 8).map((box) => ({ ...box, label: 'subject' })),
    });
    return;
  }

  const keepPhrases = job.keepPhrases.flatMap(splitPromptPhrases);
  const removePhrases = job.removePhrases.flatMap(splitPromptPhrases);
  const keepText = await clipsegMasks(image, keepPhrases);
  const removeText = await clipsegMasks(image, removePhrases);
  const guidedKeep = pointsFromMask(keepText ? thresholdMask(keepText, 160) : null, true, image.width, image.height, 6);
  const guidedRemove = pointsFromMask(removeText ? thresholdMask(removeText, 160) : null, false, image.width, image.height, 6);
  const points = [...job.points, ...guidedKeep, ...guidedRemove];
  const prompted = points.length > 0 || job.boxes.length > 0;
  const samResult = prompted ? await samMask(image, points, job.boxes) : { keep: null, remove: null };
  const mask = composeKeepRemove(image.width, image.height, {
    keepConfidence: keepText,
    removeConfidence: removeText,
    samKeep: samResult.keep,
    samRemove: samResult.remove,
  });
  scope.postMessage({ id: job.id, type: 'mask', data: mask.data, width: mask.width, height: mask.height }, [mask.data.buffer]);
}

let chain: Promise<void> = Promise.resolve();

scope.addEventListener('message', (event) => {
  const job = event.data;
  if (!job || typeof job.id !== 'number') return;
  chain = chain
    .then(async () => {
      reportProgress = (message) => scope.postMessage({ id: job.id, type: 'progress', message });
      await handle(job);
    })
    .catch((error: unknown) => {
      scope.postMessage({ id: job.id, type: 'error', message: friendlyError(error) });
    });
});
