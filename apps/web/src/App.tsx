import { createEditorRuntime, Editor, type EditorRuntime } from '@timeline/editor';
import { useEffect, useState } from 'react';
import { createWebPlatform } from './platform';

export function App() {
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);

  useEffect(() => {
    const instance = createEditorRuntime(createWebPlatform());
    // External editor runtime must be created per mount so StrictMode dispose/remount is safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resource lifecycle, not derived render state
    setRuntime(instance);
    return () => instance.dispose();
  }, []);

  if (!runtime) {
    return <div className="h-full bg-surface-0" aria-busy="true" />;
  }

  return <Editor runtime={runtime} />;
}
