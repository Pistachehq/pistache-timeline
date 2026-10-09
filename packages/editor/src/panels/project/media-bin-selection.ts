import { type MediaAssetId } from '@timeline/core';
import { type SelectionState } from '../../state/selection-store';

export function selectMediaAssetClick(
  selection: SelectionState,
  orderedAssetIds: readonly MediaAssetId[],
  assetId: MediaAssetId,
  modifiers: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
): void {
  if (modifiers.shiftKey) {
    const anchor = selection.assetAnchorId ?? selection.assetId;
    if (!anchor) {
      selection.selectAssets([assetId], 'replace');
      return;
    }
    const a = orderedAssetIds.indexOf(anchor);
    const b = orderedAssetIds.indexOf(assetId);
    if (a < 0 || b < 0) {
      selection.selectAssets([assetId], 'add');
      return;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    selection.selectAssets(orderedAssetIds.slice(lo, hi + 1), 'replace', { keepAnchor: true });
    return;
  }
  if (modifiers.ctrlKey || modifiers.metaKey) {
    selection.selectAssets([assetId], 'toggle');
    return;
  }
  selection.selectAssets([assetId], 'replace');
}

export function assetIdsForBinMove(
  primaryId: MediaAssetId,
  assetIds: readonly MediaAssetId[],
): readonly MediaAssetId[] {
  if (assetIds.includes(primaryId) && assetIds.length > 1) return assetIds;
  return [primaryId];
}
