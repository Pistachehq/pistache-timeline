import { createEditorRuntime, Editor, type EditorRuntime } from '@timeline/editor';
import { useEffect, useState } from 'react';
import { createDesktopPlatform } from './platform';

export function App() {
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const instance = createEditorRuntime(createDesktopPlatform());
      // External editor runtime must be created per mount so StrictMode dispose/remount is safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resource lifecycle, not derived render state
      setRuntime(instance);
      return () => instance.dispose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start the editor.');
      return undefined;
    }
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-0 p-8 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!runtime) {
    return <div className="h-full bg-surface-0" aria-busy="true" />;
  }

  return <Editor runtime={runtime} />;
}
