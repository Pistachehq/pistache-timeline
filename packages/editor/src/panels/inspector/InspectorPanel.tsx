import { EmptyState, PanelFrame } from '@timeline/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useSelectionState } from '../../runtime/context';
import { useActiveSequence, useSingleSelectedClip } from '../../runtime/hooks';
import { ClipInspector } from './ClipInspector';

/** Properties of the selected clip, or a placeholder when nothing applicable is selected. */
export function InspectorPanel() {
  const sequence = useActiveSequence();
  const clip = useSingleSelectedClip();
  const clipCount = useSelectionState((s) => s.clipIds.length);

  return (
    <PanelFrame title="Inspector" data-testid="inspector-panel">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {clipCount === 0 || !sequence ? (
          <EmptyState
            icon={<SlidersHorizontal />}
            title="No clip selected"
            description="Select a clip on the timeline to inspect its position, transform and audio properties."
          />
        ) : clipCount > 1 ? (
          <EmptyState
            icon={<SlidersHorizontal />}
            title={`${clipCount} clips selected`}
            description="Select a single clip to edit its properties."
          />
        ) : clip ? (
          <ClipInspector clip={clip} sequence={sequence} />
        ) : (
          <EmptyState title="Clip unavailable" description="The selected clip is no longer in the sequence." />
        )}
      </div>
    </PanelFrame>
  );
}
