import { type ClipId, clampZoom, type MediaAssetId, type TrackId } from '@timeline/core';
import { createId } from '@timeline/shared';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type EditTool = 'select' | 'razor';
export type MonitorScale = 'fit' | '25' | '50' | '100';
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

export type DialogState =
  | { readonly kind: 'export' }
  | { readonly kind: 'about' }
  | { readonly kind: 'confirm'; readonly request: ConfirmRequest };

export const DEFAULT_PIXELS_PER_FRAME = 2;

/** Transient workspace state: tools, zoom, dialogs, drags, notifications. */
export interface UiState {
  readonly tool: EditTool;
  readonly pixelsPerFrame: number;
  readonly programScale: MonitorScale;
  readonly timeDisplayFormat: TimeDisplayFormat;
  readonly snapEnabled: boolean;
  readonly snapGuideFrames: readonly number[];
  readonly dialog: DialogState | null;
  readonly status: StatusMessage | null;
  readonly tasks: readonly BackgroundTask[];
  readonly clipDrag: ClipDragState | null;
  readonly marquee: MarqueeState | null;
  readonly assetDrag: MediaAssetId | null;

  setTool(tool: EditTool): void;
  setZoom(pixelsPerFrame: number): void;
  setProgramScale(scale: MonitorScale): void;
  setTimeDisplayFormat(format: TimeDisplayFormat): void;
  setSnapEnabled(enabled: boolean): void;
  setSnapGuideFrames(frames: readonly number[]): void;
  openDialog(dialog: DialogState): void;
  closeDialog(): void;
  /** Shows a modal confirmation and resolves with the user's choice. */
  confirm(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean>;
  notify(text: string, tone?: StatusTone): void;
  clearStatus(id: string): void;
  startTask(label: string): string;
  endTask(id: string): void;
  setClipDrag(drag: ClipDragState | null): void;
  setMarquee(marquee: MarqueeState | null): void;
  setAssetDrag(assetId: MediaAssetId | null): void;
}

export type UiStore = StoreApi<UiState>;

export function createUiStore(): UiStore {
  return createStore<UiState>()((set, get) => ({
    tool: 'select',
    pixelsPerFrame: DEFAULT_PIXELS_PER_FRAME,
    programScale: 'fit',
    timeDisplayFormat: 'timecode',
    snapEnabled: true,
    snapGuideFrames: [],
    dialog: null,
    status: null,
    tasks: [],
    clipDrag: null,
    marquee: null,
    assetDrag: null,

    setTool: (tool) => set({ tool }),
    setZoom: (pixelsPerFrame) => set({ pixelsPerFrame: clampZoom(pixelsPerFrame) }),
    setProgramScale: (programScale) => set({ programScale }),
    setTimeDisplayFormat: (timeDisplayFormat) => set({ timeDisplayFormat }),
    setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
    setSnapGuideFrames: (snapGuideFrames) => set({ snapGuideFrames }),
    openDialog: (dialog) => set({ dialog }),

    closeDialog() {
      const { dialog } = get();
      if (dialog?.kind === 'confirm') dialog.request.resolve(false);
      set({ dialog: null });
    },

    confirm(options) {
      return new Promise<boolean>((resolve) => {
        if (get().dialog?.kind === 'confirm') get().closeDialog();
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
    setMarquee: (marquee) => set({ marquee }),
    setAssetDrag: (assetDrag) => set({ assetDrag }),
  }));
}
