import { AppError, type Op, type SceneDoc, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { cubeDoc } from './helpers';

const codeOf = (fn: () => void): string => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const pitchDeg = (cam: SceneDoc['camera']): number => {
  const [dx, dy, dz] = [cam.p[0] - cam.target[0], cam.p[1] - cam.target[1], cam.p[2] - cam.target[2]];
  return (Math.asin(dy / Math.hypot(dx, dy, dz)) * 180) / Math.PI;
};

const CAM: Op = { op: 'camera.save', name: 'hero' };

describe('机位保存与预设', () => {
  it('新文档自带空机位表', () => {
    expect(emptyDoc().cameras).toEqual({});
  });

  it('camera.save 记录当前机位，逆操作是删除', () => {
    const doc = cubeDoc();
    doc.camera = { ...doc.camera, p: [1, 2, 3], target: [0, 0.5, 0] };
    const res = applyOps(doc, [CAM]);
    expect(res.doc.cameras.hero).toEqual(doc.camera);
    expect(res.inverse).toEqual([{ op: 'camera.delete', name: 'hero' }]);
  });

  it('同名覆盖后逆操作还原旧机位', () => {
    const doc = cubeDoc();
    doc.cameras.hero = { ...doc.camera, p: [9, 9, 9] };
    const res = applyOps(doc, [CAM]);
    expect(res.inverse).toEqual([
      { op: 'camera.save', name: 'hero', camera: { ...doc.camera, p: [9, 9, 9] } },
    ]);
  });

  it('camera.set{name} 应用已存机位', () => {
    const doc = cubeDoc();
    doc.cameras.hero = { mode: 'persp', p: [5, 6, 7], target: [0, 1, 0], fov: 30, zoom: 1 };
    const res = applyOps(doc, [{ op: 'camera.set', name: 'hero' }]);
    expect(res.doc.camera).toEqual(doc.cameras.hero);
  });

  it('camera.set{name} 未知名报 E_CAMERA_NOT_FOUND', () => {
    const doc = cubeDoc();
    expect(codeOf(() => applyOps(doc, [{ op: 'camera.set', name: 'nope' }]))).toBe('E_CAMERA_NOT_FOUND');
  });

  it('miniature_45 俯角 45°，对准场景中心', () => {
    const doc = cubeDoc();
    const res = applyOps(doc, [{ op: 'camera.set', preset: 'miniature_45' }]);
    expect(pitchDeg(res.doc.camera)).toBeCloseTo(45, 1);
    expect(res.doc.camera.target).toEqual([0, 0.5, 0]);
  });

  it('camera.set 必须给出 frame / camera / name / preset 之一', () => {
    const doc = cubeDoc();
    expect(codeOf(() => applyOps(doc, [{ op: 'camera.set' }]))).toBe('E_INVALID_PARAMS');
  });
});
