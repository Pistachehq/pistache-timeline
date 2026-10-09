import { type ClipId, clampZoom, type MediaAssetId, type TrackId } from '@timeline/core';
import { createId } from '@timeline/shared';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type EditTool = 'select' | 'razor';
export type MonitorScale = 'fit' | '25' | '50' | '100';
/** Scales program-monitor decode size (lighter playback on long/high-res clips). */
export type PlaybackDecodeScale = '1' | '0.5' | '0.25' | '0.125';
export type TimeDisplayFormat = 'timecode' | 'frames';
export type StatusTone = 'info' | 'success' | 'warning' | 'error';

export interface StatusMessage {
  readonly id: string;
  readonly text: string;
  readonly tone: StatusTone;
}

export interface BackgroundTask {
  readonly id: string;
  readonly label: string;
}

export interface ClipDragPreview {
  readonly clipId: ClipId;
  readonly start: number;
  readonly trackId: TrackId;
  /** Vertical offset in pixels from the clip's own lane to the target lane. */
  readonly offsetY: number;
}

export interface ClipDragState {
  readonly primaryClipId: ClipId;
  readonly previews: readonly ClipDragPreview[];
}

export interface ClipTrimPreview {
  readonly clipId: ClipId;
  readonly start: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
}

export interface ClipTrimState {
  readonly primaryClipId: ClipId;
  readonly edge: 'start' | 'end';
  readonly previews: readonly ClipTrimPreview[];
}

export interface MarqueeState {
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly additive: boolean;
}

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly resolve: (confirmed: boolean) => void;
}

export interface PromptRequest {
  readonly title: string;
  readonly message?: string;
  readonly defaultValue: string;
  readonly confirmLabel: string;
  readonly resolve: (value: string | null) => void;
}

export type DialogState =
  | { readonly kind: 'export' }
  | { readonly kind: 'about' }
  | { readonly kind: 'confirm'; readonly request: ConfirmRequest }
  | { readonly kind: 'prompt'; readonly request: PromptRequest };

export const DEFAULT_PIXELS_PER_FRAME = 2;

/** Transient workspace state: tools, zoom, dialogs, drags, notifications. */
export interface UiState {
  readonly tool: EditTool;
  readonly pixelsPerFrame: number;
  readonly programScale: MonitorScale;
  readonly playbackDecodeScale: PlaybackDecodeScale;
  readonly timeDisplayFormat: TimeDisplayFormat;
  readonly snapEnabled: boolean;
  readonly snapGuideFrames: readonly number[];
  readonly dialog: DialogState | null;
  readonly status: StatusMessage | null;
  readonly tasks: readonly BackgroundTask[];
  readonly clipDrag: ClipDragState | null;
  readonly clipTrim: ClipTrimState | null;
  readonly marquee: MarqueeState | null;
  readonly assetDrag: MediaAssetId | null;
  /** Clip currently driving the audio meter (if any). */
  readonly playbackMeterClipId: ClipId | null;
  /** Short-term peak 0…1 for live waveform motion. */
  readonly playbackMeterPeak: number;

  setTool(tool: EditTool): void;
  setZoom(pixelsPerFrame: number): void;
  setProgramScale(scale: MonitorScale): void;
  setPlaybackDecodeScale(scale: PlaybackDecodeScale): void;
  setTimeDisplayFormat(format: TimeDisplayFormat): void;
  setSnapEnabled(enabled: boolean): void;
  setSnapGuideFrames(frames: readonly number[]): void;
  openDialog(dialog: DialogState): void;
  closeDialog(): void;
  /** Shows a modal confirmation and resolves with the user's choice. */
  confirm(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean>;
  prompt(options: Omit<PromptRequest, 'resolve'>): Promise<string | null>;
  notify(text: string, tone?: StatusTone): void;
  clearStatus(id: string): void;
  startTask(label: string): string;
  endTask(id: string): void;
  setClipDrag(drag: ClipDragState | null): void;
  setClipTrim(trim: ClipTrimState | null): void;
  setMarquee(marquee: MarqueeState | null): void;
  setAssetDrag(assetId: MediaAssetId | null): void;
  setPlaybackMeter(clipId: ClipId | null, peak: number): void;
}

export type UiStore = StoreApi<UiState>;

export function createUiStore(): UiStore {
  return createStore<UiState>()((set, get) => ({
    tool: 'select',
    pixelsPerFrame: DEFAULT_PIXELS_PER_FRAME,
    programScale: 'fit',
    playbackDecodeScale: '1',
    timeDisplayFormat: 'timecode',
    snapEnabled: true,
    snapGuideFrames: [],
    dialog: null,
    status: null,
    tasks: [],
    clipDrag: null,
    clipTrim: null,
    marquee: null,
    assetDrag: null,
    playbackMeterClipId: null,
    playbackMeterPeak: 0,

    setTool: (tool) => set({ tool }),
    setZoom: (pixelsPerFrame) => set({ pixelsPerFrame: clampZoom(pixelsPerFrame) }),
    setProgramScale: (programScale) => set({ programScale }),
    setPlaybackDecodeScale: (playbackDecodeScale) => set({ playbackDecodeScale }),
    setTimeDisplayFormat: (timeDisplayFormat) => set({ timeDisplayFormat }),
    setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
    setSnapGuideFrames: (snapGuideFrames) => set({ snapGuideFrames }),
    openDialog: (dialog) => set({ dialog }),

    closeDialog() {
      const { dialog } = get();
      if (dialog?.kind === 'confirm') dialog.request.resolve(false);
      if (dialog?.kind === 'prompt') dialog.request.resolve(null);
      set({ dialog: null });
    },

    confirm(options) {
      return new Promise<boolean>((resolve) => {
        const open = get().dialog;
        if (open?.kind === 'confirm') open.request.resolve(false);
        if (open?.kind === 'prompt') open.request.resolve(null);
        const request: ConfirmRequest = {
          ...options,
          resolve: (confirmed) => {
            set({ dialog: null });
            resolve(confirmed);
          },
        };
        set({ dialog: { kind: 'confirm', request } });
      });
    },

    prompt(options) {
      return new Promise<string | null>((resolve) => {
        const open = get().dialog;
        if (open?.kind === 'confirm') open.request.resolve(false);
        if (open?.kind === 'prompt') open.request.resolve(null);
        const request: PromptRequest = {
          ...options,
          resolve: (value) => {
            set({ dialog: null });
            resolve(value);
          },
        };
        set({ dialog: { kind: 'prompt', request } });
      });
    },

    notify: (text, tone = 'info') => set({ status: { id: createId('status'), text, tone } }),

    clearStatus(id) {
      if (get().status?.id === id) set({ status: null });
    },

    startTask(label) {
      const id = createId('task');
      set({ tasks: [...get().tasks, { id, label }] });
      return id;
    },

    endTask: (id) => set({ tasks: get().tasks.filter((task) => task.id !== id) }),
    setClipDrag: (clipDrag) => set({ clipDrag }),
    setClipTrim: (clipTrim) => set({ clipTrim }),
    setMarquee: (marquee) => set({ marquee }),
    setAssetDrag: (assetDrag) => set({ assetDrag }),
    setPlaybackMeter: (playbackMeterClipId, playbackMeterPeak) =>
      set({ playbackMeterClipId, playbackMeterPeak: Math.max(0, Math.min(1, playbackMeterPeak)) }),
  }));
}
