export interface SegmentPoint {
  readonly x: number;
  readonly y: number;
  readonly include: boolean;
}

export interface SegmentBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly include: boolean;
}

export interface SegmentRequest {
  readonly type: 'segment';
  readonly id: number;
  readonly bitmap: ImageBitmap;
  readonly keepPhrases: readonly string[];
  readonly removePhrases: readonly string[];
  readonly points: readonly SegmentPoint[];
  readonly boxes: readonly SegmentBox[];
  readonly quality: 'preview' | 'final';
}

export interface PropagateRequest {
  readonly type: 'propagate';
  readonly id: number;
  readonly prev: ImageBitmap;
  readonly next: ImageBitmap;
  readonly mask: Uint8Array;
  readonly maskWidth: number;
  readonly maskHeight: number;
}

export interface DetectRequest {
  readonly type: 'detect';
  readonly id: number;
  readonly bitmap: ImageBitmap;
}

export type SegmentJob = SegmentRequest | PropagateRequest | DetectRequest;

export interface SegmentMaskResult {
  readonly id: number;
  readonly type: 'mask';
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface SegmentDetectResult {
  readonly id: number;
  readonly type: 'detect';
  readonly boxes: readonly { readonly u: number; readonly v: number; readonly w: number; readonly h: number; readonly label: string }[];
}

export interface SegmentProgress {
  readonly id: number;
  readonly type: 'progress';
  readonly message: string;
}

export interface SegmentError {
  readonly id: number;
  readonly type: 'error';
  readonly message: string;
}

export type SegmentEvent = SegmentMaskResult | SegmentDetectResult | SegmentProgress | SegmentError;
