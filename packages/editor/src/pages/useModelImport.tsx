import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastKind } from '../common/Toaster';
import { IMAGE_ACCEPT } from '../lib/asset-files';
import { GLTF_ACCEPT } from '../lib/import-model';
import { useDoc } from '../stores/doc';

type Push = (kind: ToastKind, message: string) => void;

export function useModelImport(push: Push) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const ingestFiles = useDoc((s) => s.ingestFiles);
  const importing = useDoc((s) => s.importing);

  const run = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      try {
        const outcome = await ingestFiles(files);
        for (const item of outcome.models.imported) push('success', `已导入模型 ${item.name}`);
        for (const item of outcome.models.failed) push('error', `${item.name}：${item.message}`);
        for (const item of outcome.images.uploaded) push('success', `已上传图片 ${item.name}`);
        for (const item of outcome.images.failed) push('error', `${item.name}：${item.message}`);
        for (const reason of outcome.rejected) push('error', reason);
      } catch (err) {
        push('error', err instanceof Error ? err.message : String(err));
      }
    },
    [ingestFiles, push],
  );

  const open = useCallback(() => inputRef.current?.click(), []);
  const openImages = useCallback(() => imageRef.current?.click(), []);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void run(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [run]);

  const input = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={GLTF_ACCEPT}
        multiple
        className="hidden"
        data-testid="model-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void run(files);
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        data-testid="image-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void run(files);
        }}
      />
    </>
  );

  return { open, openImages, run, dragging, importing, input };
}
