import type { AssetMeta, GltfReport } from '@vibebyte/vibe3d-protocol';
import { token } from './rpc';

const DAEMON = import.meta.env.VITE_DAEMON_URL ?? '';

export interface UploadResult {
  sha: string;
  bytes: number;
  kind: 'gltf';
  gltf: GltfReport;
}

export interface ImageUploadResult {
  sha: string;
  bytes: number;
  kind: 'image';
  meta: AssetMeta;
}

type UploadBody = Partial<UploadResult> &
  Partial<ImageUploadResult> & {
    error?: { message?: string };
    message?: string;
  };

function postAsset(roomId: string, file: File, onProgress?: (ratio: number) => void): Promise<UploadBody> {
  const form = new FormData();
  form.append('file', file, file.name);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${DAEMON}/r/${roomId}/assets`);
    const auth = token();
    if (auth) xhr.setRequestHeader('authorization', `Bearer ${auth}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error('上传失败：网络中断'));
    xhr.onabort = () => reject(new Error('上传已取消'));
    xhr.onload = () => {
      let body: UploadBody | null = null;
      try {
        body = JSON.parse(xhr.responseText) as UploadBody;
      } catch {
        body = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(body?.error?.message ?? body?.message ?? `上传失败 HTTP ${xhr.status}`));
        return;
      }
      if (!body?.sha) {
        reject(new Error('上传响应缺少文件指纹'));
        return;
      }
      onProgress?.(1);
      resolve(body);
    };
    xhr.send(form);
  });
}

export async function uploadGltf(
  roomId: string,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<UploadResult> {
  const body = await postAsset(roomId, file, onProgress);
  if (!body.gltf) throw new Error('上传响应缺少 glTF 报告');
  return body as UploadResult;
}

export async function uploadImage(
  roomId: string,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<ImageUploadResult> {
  const body = await postAsset(roomId, file, onProgress);
  if (!body.meta || body.meta.kind !== 'image') throw new Error('上传响应缺少图片元数据');
  return body as ImageUploadResult;
}
