import { useEffect } from 'react';
import { useDoc } from '../stores/doc';
import { CaptureBridge } from '../viewport/CaptureBridge';
import { SceneCanvas } from '../viewport/SceneCanvas';

export function HeadlessPage() {
  const { roomId, doc, status, error } = useDoc();

  useEffect(() => {
    const root = document.documentElement;
    if (error) root.setAttribute('data-vibe3d-error', error);
    else root.removeAttribute('data-vibe3d-error');
    return () => root.removeAttribute('data-vibe3d-error');
  }, [error]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-base-content/40">
        {status === 'error' ? error : '载入…'}
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      <SceneCanvas doc={doc} headless>
        <CaptureBridge roomId={roomId} headless />
      </SceneCanvas>
    </div>
  );
}
