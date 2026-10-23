import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { type ComponentRef, useEffect, useMemo, useRef } from 'react';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { type GizmoMode, useUi } from '../stores/ui';
import { findNodeObject } from '../three/picking';

const KEYS: Record<string, GizmoMode> = { KeyW: 'translate', KeyE: 'rotate', KeyR: 'scale' };

export function Gizmo({ enabled }: { enabled: boolean }) {
  const scene = useThree((s) => s.scene);
  const selected = useSelection((s) => s.primary);
  const mode = useUi((s) => s.gizmoMode);
  const setGizmoMode = useUi((s) => s.setGizmoMode);
  const revision = useDoc((s) => s.doc?.revision ?? 0);
  const patchNode = useDoc((s) => s.patchNode);

  const tcRef = useRef<ComponentRef<typeof TransformControls>>(null);
  useEffect(() => {
    window.__tc = tcRef.current;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates in-place scene mutations
  const object = useMemo(
    () => (selected ? findNodeObject(scene, selected) : null),
    [scene, selected, revision],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      )
        return;
      const next = KEYS[e.code];
      if (next) setGizmoMode(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, setGizmoMode]);

  if (!enabled || !object || !selected) return null;

  const commit = () => {
    void patchNode(selected, {
      transform: {
        p: object.position.toArray(),
        r: [object.rotation.x, object.rotation.y, object.rotation.z],
        s: object.scale.toArray(),
      },
    });
  };

  return <TransformControls ref={tcRef} object={object} mode={mode} enabled onMouseUp={commit} />;
}
